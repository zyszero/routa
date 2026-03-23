use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

use routa_core::workflow::specialist::{SpecialistDef, SpecialistLoader};

use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(list_specialists)
            .post(create_specialist)
            .put(update_specialist)
            .delete(delete_specialist),
    )
}

#[derive(Debug, Deserialize)]
struct SpecialistQuery {
    id: Option<String>,
}

/// GET /api/specialists — List all specialists or get a specific one.
///
/// For desktop/SQLite version, we return bundled specialists only.
/// Full CRUD operations require Postgres (Vercel deployment).
async fn list_specialists(
    State(_state): State<AppState>,
    Query(query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let specialists = load_specialists();

    if let Some(id) = query.id {
        let specialist = specialists.iter().find(|s| s["id"] == id);
        if let Some(s) = specialist {
            return Ok(Json(s.clone()));
        }
        return Err(ServerError::NotFound("Specialist not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "specialists": specialists })))
}

/// POST /api/specialists — Create a new specialist.
///
/// Not supported in desktop/SQLite version.
async fn create_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist creation requires Postgres database (Vercel deployment)".to_string(),
    ))
}

/// PUT /api/specialists — Update a specialist.
///
/// Not supported in desktop/SQLite version.
async fn update_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist updates require Postgres database (Vercel deployment)".to_string(),
    ))
}

/// DELETE /api/specialists — Delete a specialist.
///
/// Not supported in desktop/SQLite version.
async fn delete_specialist(
    State(_state): State<AppState>,
    Query(_query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist deletion requires Postgres database (Vercel deployment)".to_string(),
    ))
}

fn load_specialists() -> Vec<Value> {
    let mut loader = SpecialistLoader::new();
    loader.load_default_dirs();

    let mut specialists = loader.all().values().cloned().collect::<Vec<_>>();

    if specialists.is_empty() {
        specialists = SpecialistLoader::builtin_specialists();
    } else {
        for builtin in SpecialistLoader::builtin_specialists() {
            if !specialists
                .iter()
                .any(|specialist| specialist.id == builtin.id)
            {
                specialists.push(builtin);
            }
        }
    }

    specialists.sort_by(|left, right| left.id.cmp(&right.id));
    specialists.into_iter().map(specialist_to_json).collect()
}

fn specialist_to_json(specialist: SpecialistDef) -> Value {
    serde_json::json!({
        "id": specialist.id,
        "name": specialist.name,
        "description": specialist.description,
        "role": specialist.role,
        "defaultModelTier": specialist.model_tier.to_uppercase(),
        "systemPrompt": specialist.system_prompt,
        "roleReminder": specialist.role_reminder,
        "defaultProvider": specialist.default_provider,
        "defaultAdapter": specialist.default_adapter,
        "defaultModel": specialist.default_model,
        "metadata": specialist.metadata,
        "source": "bundled",
        "enabled": true
    })
}
