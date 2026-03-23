import type { Meta, StoryObj } from "@storybook/react";
import Image from "next/image";

const tokenGroups = [
  {
    label: "Logo Background",
    tokens: [
      { name: "bg-900", value: "#1E293B" },
      { name: "bg-950", value: "#0F172A" },
      { name: "route-neutral", value: "#94A3B8" },
    ],
  },
  {
    label: "Coordinator Blue",
    tokens: [
      { name: "routa-blue-400", value: "#60A5FA" },
      { name: "routa-blue-500", value: "#3B82F6" },
    ],
  },
  {
    label: "Crafter Orange",
    tokens: [
      { name: "task-amber-300", value: "#FCD34D" },
      { name: "task-amber-500", value: "#F59E0B" },
    ],
  },
  {
    label: "Gate Green",
    tokens: [
      { name: "gate-emerald-400", value: "#34D399" },
      { name: "gate-emerald-500", value: "#10B981" },
    ],
  },
  {
    label: "Suggested Product Mapping",
    tokens: [
      { name: "primary-action", value: "#3B82F6" },
      { name: "in-progress", value: "#F59E0B" },
      { name: "verified", value: "#10B981" },
      { name: "shell-surface", value: "#1E293B" },
      { name: "shell-depth", value: "#0F172A" },
    ],
  },
];

function TokenGrid() {
  return (
    <div className="grid gap-6 p-6">
      <section className="overflow-hidden rounded-3xl border border-slate-700/60 bg-[linear-gradient(135deg,#1E293B_0%,#0F172A_100%)] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Brand Source
            </div>
            <h2 className="text-2xl font-semibold">Routa palette should start from the logo, not from the desktop runtime skin.</h2>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              The coordinator node defines the primary blue, task execution maps to amber, verification maps to emerald, and the slate gradient provides the base shell atmosphere.
            </p>
          </div>
          <Image
            src="/logo.svg"
            alt="Routa logo"
            width={112}
            height={112}
            className="h-28 w-28 rounded-[28px] border border-white/10 bg-slate-950/40 p-2"
          />
        </div>
      </section>

      {tokenGroups.map((group) => (
        <section key={group.label} className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {group.label}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.tokens.map((token) => (
              <article
                key={token.name}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <div
                  className="h-24 border-b border-slate-200 dark:border-slate-800"
                  style={{ backgroundColor: token.value }}
                />
                <div className="space-y-1 px-3 py-2.5">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{token.name}</div>
                  <code className="block text-[11px] text-slate-500 dark:text-slate-400">{token.value}</code>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: "Shared/BrandColorSystem",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  render: () => <TokenGrid />,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const LightMode: Story = {};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
