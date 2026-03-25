//! `routa -p "requirement"` — Run the full Routa agent flow from CLI.
//!
//! Mirrors the web UI flow:
//! 1. Creates a workspace (or uses default)
//! 2. Spawns a ROUTA coordinator agent
//! 3. Sends the user's requirement as the initial prompt
//! 4. Streams session updates (agent messages, tool calls, delegations)
//! 5. Coordinator generates @@@task blocks → delegates to CRAFTER agents
//! 6. Waits for all child agents to complete

use std::sync::Arc;

use routa_core::models::agent::AgentRole;
use routa_core::orchestration::{OrchestratorConfig, RoutaOrchestrator, SpecialistConfig};
use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

use super::review::stream_parser::{extract_update_text, update_contains_turn_complete};
use super::tui::TuiRenderer;

/// Run the full Routa coordinator flow for a user prompt.
pub async fn run(
    state: &AppState,
    prompt: &str,
    workspace_id: &str,
    provider: &str,
) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    // ── 1. Use default workspace (always exists) ────────────────────────
    let workspace_id = if workspace_id == "default" {
        "default".to_string()
    } else {
        // For non-default workspaces, try to get or create
        let ws_response = router
            .handle_value(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "workspaces.get",
                "params": { "id": workspace_id }
            }))
            .await;

        if ws_response.get("error").is_some() {
            // Create workspace if it doesn't exist
            let create_resp = router
                .handle_value(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "workspaces.create",
                    "params": {
                        "title": workspace_id
                    }
                }))
                .await;

            if let Some(err) = create_resp.get("error") {
                let err_msg = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                return Err(format!("Failed to create workspace: {}", err_msg));
            }

            // Get the created workspace ID
            let created_ws_id = create_resp
                .get("result")
                .and_then(|r| r.get("workspace"))
                .and_then(|w| w.get("id"))
                .and_then(|id| id.as_str())
                .ok_or("Failed to get created workspace ID")?
                .to_string();

            println!("Created workspace: {}", created_ws_id);
            created_ws_id
        } else {
            workspace_id.to_string()
        }
    };

    // ── 2. Create ROUTA coordinator agent ───────────────────────────────
    let agent_name = "cli-coordinator";
    let create_response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "agents.create",
            "params": {
                "name": agent_name,
                "role": "ROUTA",
                "workspaceId": &workspace_id
            }
        }))
        .await;

    let agent_id = create_response
        .get("result")
        .and_then(|r| r.get("agentId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            let error_msg = create_response
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            format!("Failed to create coordinator agent: {}", error_msg)
        })?
        .to_string();

    // ── 3. Build coordinator prompt ─────────────────────────────────────
    let specialist =
        SpecialistConfig::by_role(&AgentRole::Routa).unwrap_or_else(SpecialistConfig::crafter);

    let coordinator_prompt = format!(
        "{}\n\n---\n\n\
         **Your Agent ID:** {}\n\
         **Workspace ID:** {}\n\n\
         ## User Request\n\n{}\n\n\
         ---\n**Reminder:** {}\n",
        specialist.system_prompt, agent_id, &workspace_id, prompt, specialist.role_reminder
    );

    // ── 4. Create ACP session for the coordinator ───────────────────────
    let session_id = uuid::Uuid::new_v4().to_string();

    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║  Routa CLI — Multi-Agent Coordinator                    ║");
    println!("╠══════════════════════════════════════════════════════════╣");
    println!("║  Workspace : {:<42} ║", &workspace_id);
    println!("║  Agent     : {} (ROUTA)  {:<27} ║", &agent_id[..8], "");
    println!("║  Provider  : {:<42} ║", provider);
    println!("║  CWD       : {:<42} ║", truncate_path(&cwd, 42));
    println!("╚══════════════════════════════════════════════════════════╝");
    println!();
    println!("📋 Requirement: {}", prompt);
    println!();

    let spawn_result = state
        .acp_manager
        .create_session(
            session_id.clone(),
            cwd.clone(),
            workspace_id.clone(),
            Some(provider.to_string()),
            Some("ROUTA".to_string()),
            None,
            None, // branch
            None, // tool_mode
            None, // mcp_profile
        )
        .await;

    match spawn_result {
        Ok((sid, _)) => {
            tracing::info!("Coordinator session created: {}", sid);
        }
        Err(e) => {
            return Err(format!("Failed to create ACP session: {}", e));
        }
    }

    // ── 5. Register with orchestrator ───────────────────────────────────
    let acp = Arc::new(state.acp_manager.clone());
    let orchestrator = RoutaOrchestrator::new(
        OrchestratorConfig::default(),
        acp,
        state.agent_store.clone(),
        state.task_store.clone(),
        state.event_bus.clone(),
    );
    orchestrator
        .register_agent_session(&agent_id, &session_id)
        .await;

    // ── 6. Subscribe to session updates ─────────────────────────────────
    let mut rx = state
        .acp_manager
        .subscribe(&session_id)
        .await
        .ok_or("Failed to subscribe to session updates")?;

    // ── 7. Send the coordinator prompt ──────────────────────────────────
    println!("🚀 Sending requirement to coordinator...");
    println!();

    let mut renderer = TuiRenderer::new();
    let mut idle_count = 0u32;
    let max_idle = 600; // 10 minutes at 1s intervals
    let initial_wait_notice_threshold = 3;
    let prompt_finished_idle_threshold = 3;
    let mut prompt_finished = false;
    let mut prompt_error: Option<String> = None;
    let mut saw_output = false;
    let mut waiting_notice_shown = false;
    let prompt_future = state.acp_manager.prompt(&session_id, &coordinator_prompt);
    tokio::pin!(prompt_future);

    loop {
        let tick = tokio::time::sleep(std::time::Duration::from_secs(1));
        tokio::pin!(tick);

        tokio::select! {
            prompt_result = &mut prompt_future, if !prompt_finished => {
                prompt_finished = true;
                if let Err(err) = prompt_result {
                    renderer.finish();
                    prompt_error = Some(format!("Failed to send prompt: {}", err));
                    break;
                }
            }
            recv_result = rx.recv() => {
                match recv_result {
                    Ok(update) => {
                        idle_count = 0;
                        let update_payload = update
                            .get("params")
                            .and_then(|params| params.get("update"))
                            .and_then(|value| value.as_object());
                        if let Some(update_payload) = update_payload {
                            if let Some(text) = extract_update_text(update_payload) {
                                if !text.trim().is_empty() {
                                    saw_output = true;
                                }
                            }
                        }
                        let is_done = update
                            .get("params")
                            .and_then(|params| params.get("update"))
                            .and_then(|value| value.get("sessionUpdate"))
                            .and_then(|value| value.as_str())
                            == Some("turn_complete");
                        renderer.handle_update(&update);
                        if is_done {
                            renderer.finish();
                            println!("═══ Coordinator turn complete ═══");
                            break;
                        }
                    }
                    Err(_) => {
                        renderer.finish();
                        println!("═══ Coordinator session ended ═══");
                        break;
                    }
                }
            }
            _ = &mut tick => {
                idle_count += 1;
                if !waiting_notice_shown
                    && !saw_output
                    && idle_count >= initial_wait_notice_threshold
                {
                    println!("… Waiting for coordinator output");
                    waiting_notice_shown = true;
                }

                if let Some(history) = state.acp_manager.get_session_history(&session_id).await {
                    if update_contains_turn_complete(&history) {
                        renderer.finish();
                        println!("═══ Coordinator turn complete ═══");
                        break;
                    }
                }

                if prompt_finished && idle_count >= prompt_finished_idle_threshold {
                    renderer.finish();
                    println!("═══ Coordinator response complete ═══");
                    break;
                }

                if idle_count >= max_idle {
                    renderer.finish();
                    println!("⏰ Timeout: no activity for {} seconds", max_idle);
                    break;
                }

                if !state.acp_manager.is_alive(&session_id).await {
                    renderer.finish();
                    println!("═══ Coordinator process exited ═══");
                    break;
                }
            }
        }
    }

    if let Some(error) = prompt_error {
        state.acp_manager.kill_session(&session_id).await;
        orchestrator.cleanup(&session_id).await;
        return Err(error);
    }

    // ── 9. Print summary ────────────────────────────────────────────────
    println!();
    print_session_summary(&router, &workspace_id).await;

    // ── 10. Cleanup ─────────────────────────────────────────────────────
    state.acp_manager.kill_session(&session_id).await;
    orchestrator.cleanup(&session_id).await;

    Ok(())
}

/// Print a summary of agents and tasks after the session completes.
pub(crate) async fn print_session_summary(router: &RpcRouter, workspace_id: &str) {
    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║  Session Summary                                        ║");
    println!("╚══════════════════════════════════════════════════════════╝");

    // List agents
    let agents_resp = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 100,
            "method": "agents.list",
            "params": { "workspaceId": workspace_id }
        }))
        .await;

    if let Some(result) = agents_resp.get("result") {
        if let Some(agents) = result.get("agents").and_then(|a| a.as_array()) {
            println!();
            println!("  Agents ({}):", agents.len());
            for agent in agents {
                let name = agent.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                let role = agent.get("role").and_then(|v| v.as_str()).unwrap_or("?");
                let status = agent.get("status").and_then(|v| v.as_str()).unwrap_or("?");
                let icon = match status {
                    "COMPLETED" => "✅",
                    "ACTIVE" => "🔄",
                    "ERROR" => "❌",
                    _ => "⏳",
                };
                println!("    {} {} ({}) — {}", icon, name, role, status);
            }
        }
    }

    // List tasks
    let tasks_resp = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 101,
            "method": "tasks.list",
            "params": { "workspaceId": workspace_id }
        }))
        .await;

    if let Some(result) = tasks_resp.get("result") {
        if let Some(tasks) = result.get("tasks").and_then(|a| a.as_array()) {
            println!();
            println!("  Tasks ({}):", tasks.len());
            for task in tasks {
                let title = task.get("title").and_then(|v| v.as_str()).unwrap_or("?");
                let status = task.get("status").and_then(|v| v.as_str()).unwrap_or("?");
                let icon = match status {
                    "COMPLETED" => "✅",
                    "IN_PROGRESS" => "🔄",
                    "NEEDS_FIX" => "🔧",
                    "BLOCKED" => "🚫",
                    "CANCELLED" => "🗑️",
                    _ => "⏳",
                };
                println!("    {} {} — {}", icon, title, status);
            }
        }
    }

    println!();
}

pub(crate) fn truncate_path(path: &str, max_len: usize) -> String {
    if path.len() <= max_len {
        path.to_string()
    } else {
        format!("...{}", &path[path.len() - (max_len - 3)..])
    }
}
