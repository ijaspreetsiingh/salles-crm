import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  CircleAlert,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import {
  createWorkflow,
  deleteWorkflow,
  discardWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflows,
  retryWorkflowRun,
  runWorkflow,
  updateWorkflow,
  type GraphRunDto,
  type WorkflowDto,
  type WorkflowGraphDto,
} from "@/lib/api/modules";

/* ------------------------------------------------------------------ *\
   Node catalogue — what a travel agency actually automates
\* ------------------------------------------------------------------ */

const TRIGGERS = [
  { kind: "lead_created", label: "New enquiry arrives" },
  { kind: "record_created", label: "A record is created" },
  { kind: "status_changed", label: "A status changes" },
  { kind: "booking_confirmed", label: "Booking confirmed" },
  { kind: "invoice_overdue", label: "Invoice becomes overdue" },
  { kind: "payment_received", label: "Payment received" },
  { kind: "manual", label: "Run manually" },
];

const CONDITIONS = [
  { kind: "always", label: "Continue" },
  { kind: "amount_above", label: "Amount is above…", config: { value: "50000" } },
  { kind: "amount_below", label: "Amount is below…", config: { value: "100000" } },
  { kind: "status_is", label: "Status is…", config: { value: "New" } },
  { kind: "status_not", label: "Status is not…", config: { value: "Cancelled" } },
  { kind: "owner_empty", label: "Nobody owns it" },
  { kind: "owner_is", label: "Owner is…", config: { value: "" } },
  { kind: "destination_is", label: "Destination contains…", config: { value: "Dubai" } },
  { kind: "source_is", label: "Source is…", config: { value: "Website" } },
];

const ACTIONS = [
  {
    kind: "create_task",
    label: "Create a follow-up task",
    config: { title: "Call the customer today" },
  },
  { kind: "notify", label: "Notify the team", config: { message: "A hot enquiry needs a owner" } },
  { kind: "send_email", label: "Send an email", config: { subject: "", body: "" } },
  { kind: "send_whatsapp", label: "Send a WhatsApp", config: { body: "" } },
  { kind: "assign_owner", label: "Assign to me" },
  { kind: "update_status", label: "Change status to…", config: { value: "Contacted" } },
  {
    kind: "send_alert",
    label: "Send an alert",
    config: { channel: "email", message: "Alert: review this record" },
  },
  { kind: "webhook", label: "Call a webhook", config: { url: "" } },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  [...TRIGGERS, ...CONDITIONS, ...ACTIONS].map((entry) => [entry.kind, entry.label]),
);

const NODE_W = 208;
const NODE_H = 92;

const newId = () => `n_${Math.random().toString(36).slice(2, 9)}`;

const defaultGraph = (workflow: WorkflowDto): WorkflowGraphDto => {
  const triggerKind =
    TRIGGERS.find((trigger) =>
      workflow.trigger.toLowerCase().includes(trigger.kind.split("_")[0] ?? ""),
    )?.kind ?? "lead_created";
  const triggerId = newId();
  const actionId = newId();
  return {
    nodes: [
      {
        id: triggerId,
        type: "trigger",
        kind: triggerKind,
        label: KIND_LABEL[triggerKind] ?? "When this happens",
        x: 60,
        y: 140,
      },
      {
        id: actionId,
        type: "action",
        kind: "create_task",
        label: "Create a follow-up task",
        x: 360,
        y: 140,
        config: { title: `Follow up: ${workflow.name}` },
      },
    ],
    edges: [{ from: triggerId, to: actionId }],
  };
};

const parseGraph = (workflow: WorkflowDto): WorkflowGraphDto => {
  if (!workflow.graph) return defaultGraph(workflow);
  try {
    const parsed = JSON.parse(workflow.graph) as WorkflowGraphDto;
    if (!parsed.nodes?.length) return defaultGraph(workflow);
    return { nodes: parsed.nodes, edges: parsed.edges ?? [] };
  } catch {
    return defaultGraph(workflow);
  }
};

/* ------------------------------------------------------------------ */

export function AutomationStudio() {
  const { data: workflows, reload } = useApiQuery(() => fetchWorkflows(), []);
  const { data: runs, reload: reloadRuns } = useApiQuery(() => fetchWorkflowRuns(), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [graph, setGraph] = useState<WorkflowGraphDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GraphRunDto | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const list = workflows ?? [];
  const active = list.find((workflow) => workflow.id === activeId) ?? list[0];

  // Opening a workflow loads its saved graph; the canvas is the source of truth.
  useEffect(() => {
    if (!active) return;
    setGraph(parseGraph(active));
    setSelectedId(null);
    setPendingFrom(null);
    setDirty(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;
  const resultByNode = useMemo(
    () => new Map((result?.nodes ?? []).map((entry) => [entry.id, entry])),
    [result],
  );

  const createNew = async () => {
    setBusy(true);
    try {
      const created = await createWorkflow({
        name: `New automation ${list.length + 1}`,
        moduleId: "leads",
        trigger: "New lead created",
        action: "Create follow-up task",
      });
      await reload();
      setActiveId(created.id);
      toast.success("Workflow created — draw the steps and save");
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the workflow"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!active || !graph) return;
    setBusy(true);
    try {
      await updateWorkflow(active.id, { graph: JSON.stringify(graph) });
      setDirty(false);
      await reload();
      toast.success("Canvas saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the canvas"));
    } finally {
      setBusy(false);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!active || !graph) return;
    setBusy(true);
    try {
      // The server runs what is saved, so save any pending canvas edits first.
      // A workflow drawn here for the first time has no graph on the server yet.
      if (dirty || !active.graph) {
        await updateWorkflow(active.id, { graph: JSON.stringify(graph) });
        setDirty(false);
      }
      const out = await runWorkflow(active.id, { dryRun });
      if (out.nodes) {
        setResult({
          status: out.status,
          log: out.log,
          dryRun: out.dryRun ?? dryRun,
          nodes: out.nodes,
        });
      }
      if (out.status === "failed") toast.error("A step failed — see the run panel");
      else if (out.status === "skipped") toast.info("Nothing ran — check the conditions");
      else toast.success(dryRun ? "Test finished — nothing was sent" : "Workflow executed");
      if (!dryRun) {
        await reload();
        reloadRuns();
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not run the workflow"));
    } finally {
      setBusy(false);
    }
  };

  const addNode = (
    type: "condition" | "action",
    kind: string,
    label: string,
    config?: Record<string, string>,
  ) => {
    if (!graph) return;
    const id = newId();
    const maxY = graph.nodes.reduce((max, node) => Math.max(max, node.y), 60);
    setGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          type,
          kind,
          label,
          x: 200,
          y: Math.min(maxY + 120, 520),
          ...(config ? { config } : {}),
        },
      ],
    });
    setSelectedId(id);
    setPaletteOpen(false);
    setDirty(true);
  };

  const removeNode = (id: string) => {
    if (!graph) return;
    setGraph({
      nodes: graph.nodes.filter((node) => node.id !== id),
      edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
    });
    setSelectedId(null);
    setDirty(true);
  };

  const connect = (to: string) => {
    if (!graph || !pendingFrom || pendingFrom === to) {
      setPendingFrom(null);
      return;
    }
    const exists = graph.edges.some((edge) => edge.from === pendingFrom && edge.to === to);
    setGraph({
      ...graph,
      edges: exists ? graph.edges : [...graph.edges, { from: pendingFrom, to }],
    });
    setPendingFrom(null);
    setDirty(true);
  };

  const removeEdge = (from: string, to: string) => {
    if (!graph) return;
    setGraph({ ...graph, edges: graph.edges.filter((e) => !(e.from === from && e.to === to)) });
    setDirty(true);
  };

  /* Drag: pointer events on the node header, coordinates relative to the canvas. */
  const startDrag = (event: React.PointerEvent, id: string) => {
    const node = graph?.nodes.find((entry) => entry.id === id);
    const box = canvasRef.current?.getBoundingClientRect();
    if (!node || !box) return;
    dragRef.current = {
      id,
      dx: event.clientX - box.left - node.x,
      dy: event.clientY - box.top - node.y,
    };
    setSelectedId(id);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const box = canvasRef.current?.getBoundingClientRect();
      if (!drag || !box || !graph) return;
      const x = Math.max(0, Math.min(event.clientX - box.left - drag.dx, box.width - NODE_W - 8));
      const y = Math.max(0, Math.min(event.clientY - box.top - drag.dy, box.height - NODE_H - 8));
      setGraph((current) =>
        current
          ? {
              ...current,
              nodes: current.nodes.map((node) => (node.id === drag.id ? { ...node, x, y } : node)),
            }
          : current,
      );
      setDirty(true);
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [graph]);

  if (!list.length) {
    return (
      <div className="glass-card p-8 text-center">
        <WorkflowIcon className="mx-auto mb-3 size-7 text-muted" />
        <h3 className="text-base font-semibold">No automations yet</h3>
        <p className="mt-1 text-sm text-muted">
          Build one on the canvas: pick what starts it, add a condition, then what should happen.
        </p>
        <Button className="mt-4" disabled={busy} onClick={() => void createNew()}>
          <Plus className="size-4" /> New automation
        </Button>
      </div>
    );
  }

  return (
    <div className="auto-studio">
      <aside className="auto-list">
        <div className="flex items-center justify-between px-2 pb-2">
          <strong className="text-xs uppercase tracking-wide text-muted">Automations</strong>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void createNew()}>
            <Plus className="size-4" />
          </Button>
        </div>
        {list.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            className={`auto-list__item ${workflow.id === active?.id ? "is-active" : ""}`}
            onClick={() => setActiveId(workflow.id)}
          >
            <span className="min-w-0 flex-1 text-left">
              <strong className="block truncate text-[12.5px]">{workflow.name}</strong>
              <small className="text-[11px] text-muted">
                {workflow.status} · {workflow.runCount} run{workflow.runCount === 1 ? "" : "s"}
              </small>
            </span>
            <span className={`auto-dot ${workflow.status === "Active" ? "is-on" : ""}`} />
          </button>
        ))}
      </aside>

      <section className="auto-main">
        <header className="auto-toolbar">
          <input
            className="auto-name"
            value={active?.name ?? ""}
            onChange={(e) => {
              if (!active) return;
              void updateWorkflow(active.id, { name: e.target.value || "Untitled" })
                .then(() => reload())
                .catch(() => undefined);
            }}
            aria-label="Workflow name"
          />
          <span className="text-[11px] text-muted">on {active?.moduleId}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {dirty && <span className="text-[11px] text-butter">Unsaved</span>}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              <Save className="size-4" /> Save
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(true)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Test
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void run(false)}>
              <Play className="size-4" /> Run now
            </Button>
          </div>
        </header>

        <div className="auto-canvas" ref={canvasRef}>
          <svg className="auto-wires" aria-hidden>
            {graph?.edges.map((edge) => {
              const from = graph.nodes.find((node) => node.id === edge.from);
              const to = graph.nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;
              const mid = Math.max(24, Math.abs(x2 - x1) / 2);
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={`M${x1},${y1} C${x1 + mid},${y1} ${x2 - mid},${y2} ${x2},${y2}`}
                    className="auto-wire"
                  />
                  <path
                    d={`M${x1},${y1} C${x1 + mid},${y1} ${x2 - mid},${y2} ${x2},${y2}`}
                    className="auto-wire-hit"
                    onClick={() => removeEdge(edge.from, edge.to)}
                  />
                </g>
              );
            })}
          </svg>

          {graph?.nodes.map((node) => {
            const runState = resultByNode.get(node.id);
            return (
              <div
                key={node.id}
                className={`auto-node auto-node--${node.type} ${
                  selectedId === node.id ? "is-selected" : ""
                } ${runState ? `is-${runState.status}` : ""}`}
                style={{ left: node.x, top: node.y, width: NODE_W }}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).dataset["port"]) return;
                  startDrag(event, node.id);
                }}
              >
                <span
                  className="auto-port auto-port--in"
                  data-port="in"
                  onClick={(event) => {
                    event.stopPropagation();
                    connect(node.id);
                  }}
                  title="Connect a step here"
                />
                <div className="auto-node__head">
                  <span className="auto-node__kind">
                    {node.type === "trigger" ? "When" : node.type === "condition" ? "If" : "Then"}
                  </span>
                  <strong>{node.label}</strong>
                </div>
                <p className="auto-node__detail">
                  {node.kind === "amount_above" && `More than ${node.config?.["value"] ?? "0"}`}
                  {node.kind === "amount_below" && `Less than ${node.config?.["value"] ?? "0"}`}
                  {node.kind === "status_is" && `Status is ${node.config?.["value"] ?? "…"}`}
                  {node.kind === "status_not" && `Status is not ${node.config?.["value"] ?? "…"}`}
                  {node.kind === "owner_is" && `Owner is ${node.config?.["value"] ?? "…"}`}
                  {node.kind === "destination_is" &&
                    `Destination has "${node.config?.["value"] ?? "…"}"`}
                  {node.kind === "source_is" && `Source is ${node.config?.["value"] ?? "…"}`}
                  {node.kind === "update_status" && `New status: ${node.config?.["value"] ?? "…"}`}
                  {node.kind === "create_task" && String(node.config?.["title"] ?? "Create a task")}
                  {["send_email", "send_whatsapp", "notify", "send_alert"].includes(node.kind) &&
                    String(
                      node.config?.["body"] ?? node.config?.["message"] ?? "Write the message",
                    )}
                  {node.kind === "webhook" && `POST to ${node.config?.["url"] ?? "(no URL)"}`}
                  {![
                    "amount_above",
                    "amount_below",
                    "status_is",
                    "status_not",
                    "owner_is",
                    "destination_is",
                    "source_is",
                    "update_status",
                    "create_task",
                    "send_email",
                    "send_whatsapp",
                    "notify",
                    "send_alert",
                    "webhook",
                  ].includes(node.kind) && KIND_LABEL[node.kind]}
                </p>
                <div className="auto-node__foot">
                  {runState ? (
                    <span className={`auto-state auto-state--${runState.status}`}>
                      {runState.status === "done" ? (
                        <Check className="size-3" />
                      ) : runState.status === "failed" ? (
                        <CircleAlert className="size-3" />
                      ) : (
                        <ArrowRight className="size-3" />
                      )}
                      {runState.status}
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-muted">{node.type}</span>
                  )}
                  {node.type !== "trigger" && (
                    <button
                      type="button"
                      className="auto-node__del"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeNode(node.id);
                      }}
                      aria-label={`Delete ${node.label}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
                {node.type !== "condition" && (
                  <span
                    className="auto-port auto-port--out"
                    data-port="out"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingFrom(node.id);
                    }}
                    title="Drag from here to the next step"
                  />
                )}
                {node.type === "condition" && (
                  <span
                    className="auto-port auto-port--out"
                    data-port="out"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingFrom(node.id);
                    }}
                    title="When the condition is true"
                  />
                )}
              </div>
            );
          })}

          <div className="auto-palette">
            <Button size="sm" variant="outline" onClick={() => setPaletteOpen((open) => !open)}>
              <Plus className="size-4" /> Add step
            </Button>
            {paletteOpen && (
              <div className="auto-palette__menu">
                <p>If this is true</p>
                {CONDITIONS.map((condition) => (
                  <button
                    key={condition.kind}
                    type="button"
                    onClick={() =>
                      addNode("condition", condition.kind, condition.label, condition.config)
                    }
                  >
                    {condition.label}
                  </button>
                ))}
                <p>Then do this</p>
                {ACTIONS.map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    onClick={() => addNode("action", action.kind, action.label, action.config)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {pendingFrom && (
            <div className="auto-hint">Now click the round dot on the next step to connect it.</div>
          )}
        </div>

        {result && (
          <div className="auto-run">
            <header>
              <strong>{result.dryRun ? "Test run" : "Last run"}</strong>
              <span className={`auto-run__status is-${result.status}`}>{result.status}</span>
              <button
                type="button"
                className="ml-auto text-xs text-muted"
                onClick={() => setResult(null)}
              >
                Hide
              </button>
            </header>
            <ul>
              {result.nodes.map((node) => (
                <li key={node.id} className={`is-${node.status}`}>
                  <strong>{node.label}</strong>
                  <span>{node.detail}</span>
                </li>
              ))}
            </ul>
            {result.dryRun && (
              <p className="text-[11px] text-muted">
                Nothing was created or sent — this run only read a real record to check the logic.
              </p>
            )}
          </div>
        )}
      </section>

      <aside className="auto-inspector">
        {selected ? (
          <>
            <h3>{selected.label}</h3>
            <p className="text-[11px] text-muted">
              {selected.type} · {selected.kind}
            </p>

            {[
              "amount_above",
              "amount_below",
              "status_is",
              "status_not",
              "owner_is",
              "destination_is",
              "source_is",
              "update_status",
            ].includes(selected.kind) && (
              <label>
                {selected.kind === "status_is" || selected.kind === "status_not"
                  ? "Status value"
                  : selected.kind === "update_status"
                    ? "New status"
                    : "Value"}
                <input
                  value={String(selected.config?.["value"] ?? "")}
                  onChange={(e) =>
                    setGraph((current) =>
                      current
                        ? {
                            ...current,
                            nodes: current.nodes.map((node) =>
                              node.id === selected.id
                                ? { ...node, config: { ...node.config, value: e.target.value } }
                                : node,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </label>
            )}

            {selected.kind === "create_task" && (
              <label>
                Task title
                <input
                  value={String(selected.config?.["title"] ?? "")}
                  onChange={(e) =>
                    setGraph((current) =>
                      current
                        ? {
                            ...current,
                            nodes: current.nodes.map((node) =>
                              node.id === selected.id
                                ? { ...node, config: { ...node.config, title: e.target.value } }
                                : node,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </label>
            )}

            {["send_email", "send_whatsapp", "notify", "send_alert"].includes(selected.kind) && (
              <>
                {selected.kind === "send_alert" && (
                  <label>
                    Alert channel
                    <select
                      value={String(selected.config?.["channel"] ?? "email")}
                      onChange={(e) =>
                        setGraph((current) =>
                          current
                            ? {
                                ...current,
                                nodes: current.nodes.map((node) =>
                                  node.id === selected.id
                                    ? {
                                        ...node,
                                        config: { ...node.config, channel: e.target.value },
                                      }
                                    : node,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      <option value="email">Email alert</option>
                      <option value="whatsapp">WhatsApp alert</option>
                      <option value="notification">In-app notification</option>
                    </select>
                  </label>
                )}
                <label>
                  {selected.kind === "send_alert" ? "Alert message" : "Message"}
                  <textarea
                    rows={5}
                    value={String(selected.config?.["body"] ?? selected.config?.["message"] ?? "")}
                    onChange={(e) =>
                      setGraph((current) =>
                        current
                          ? {
                              ...current,
                              nodes: current.nodes.map((node) =>
                                node.id === selected.id
                                  ? {
                                      ...node,
                                      config: {
                                        ...node.config,
                                        ...(node.kind === "notify" || node.kind === "send_alert"
                                          ? { message: e.target.value }
                                          : { body: e.target.value }),
                                      },
                                    }
                                  : node,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                {selected.kind === "send_email" && (
                  <label>
                    Subject
                    <input
                      value={String(selected.config?.["subject"] ?? "")}
                      onChange={(e) =>
                        setGraph((current) =>
                          current
                            ? {
                                ...current,
                                nodes: current.nodes.map((node) =>
                                  node.id === selected.id
                                    ? {
                                        ...node,
                                        config: { ...node.config, subject: e.target.value },
                                      }
                                    : node,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                )}
                <p className="text-[11px] text-muted">
                  Recipient comes from the record&apos;s email / phone. Leave it empty to use the
                  customer&apos;s own details.
                </p>
              </>
            )}

            {selected.kind === "webhook" && (
              <label>
                Webhook URL
                <input
                  type="url"
                  placeholder="https://hooks.example.com/inbox"
                  value={String(selected.config?.["url"] ?? "")}
                  onChange={(e) =>
                    setGraph((current) =>
                      current
                        ? {
                            ...current,
                            nodes: current.nodes.map((node) =>
                              node.id === selected.id
                                ? { ...node, config: { ...node.config, url: e.target.value } }
                                : node,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </label>
            )}

            <div className="auto-conns">
              <h4>Connections</h4>
              {(graph?.edges ?? [])
                .filter((edge) => edge.from === selected.id || edge.to === selected.id)
                .map((edge) => (
                  <div key={`${edge.from}-${edge.to}`}>
                    <span>
                      {graph?.nodes.find((n) => n.id === edge.from)?.label ?? "?"} →{" "}
                      {graph?.nodes.find((n) => n.id === edge.to)?.label ?? "?"}
                    </span>
                    <button type="button" onClick={() => removeEdge(edge.from, edge.to)}>
                      Remove
                    </button>
                  </div>
                ))}
              {(graph?.edges ?? []).filter(
                (edge) => edge.from === selected.id || edge.to === selected.id,
              ).length === 0 && <p className="text-[11px] text-muted">Not connected yet.</p>}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">
            <h3 className="mb-1 text-sm font-semibold text-foreground">How this works</h3>
            <p>1. Pick a step to edit it.</p>
            <p>2. Click the dot on a step, then the dot on the next one to connect them.</p>
            <p className="mt-2">
              Conditions stop a branch when they are false, so only the right customers get the
              message.
            </p>
            <button
              type="button"
              className="mt-3 text-xs text-tomato"
              disabled={busy}
              onClick={async () => {
                if (!active) return;
                if (!window.confirm(`Delete "${active.name}"?`)) return;
                await deleteWorkflow(active.id).then(() => {
                  toast.success("Workflow deleted");
                  reload();
                });
              }}
            >
              Delete this workflow
            </button>
          </div>
        )}

        {runs && runs.items.length > 0 && (
          <div className="auto-history">
            <h4>Recent runs</h4>
            {runs.items.slice(0, 5).map((run) => (
              <div key={run.id}>
                <span>{run.workflow}</span>
                <small>
                  {new Date(run.startedAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                <span className={`auto-run__status is-${run.status}`}>{run.status}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ *\
   Execution history — what each run actually did
\* ------------------------------------------------------------------ */

export function ExecutionHistory() {
  const { data, loading, error, reload } = useApiQuery(() => fetchWorkflowRuns(), []);
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const runs = data?.items ?? [];
  const shown = filter === "All" ? runs : runs.filter((run) => run.status === filter);

  const statuses = ["All", "success", "failed", "dead", "skipped", "discarded"];

  const retry = async (id: string) => {
    setBusy(id);
    try {
      const run = await retryWorkflowRun(id);
      if (run.status === "success") toast.success("The rule worked this time");
      else toast.error(`Still failing — ${run.attempts} of 3 attempts used`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not retry this run"));
    } finally {
      setBusy(null);
    }
  };

  const discard = async (id: string) => {
    setBusy(id);
    try {
      await discardWorkflowRun(id);
      toast.success("This run will not be tried again");
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not discard this run"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs capitalize transition-colors ${
                filter === status
                  ? "border-foreground bg-foreground text-background"
                  : "border-line bg-white text-muted hover:text-foreground"
              }`}
            >
              {status === "All" ? "All runs" : status === "dead" ? "Gave up" : status}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => reload()} disabled={loading}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <WorkflowIcon className="size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="glass-card flex items-center gap-2 p-4 text-sm text-tomato">
          <CircleAlert className="size-4" /> {error}
        </div>
      )}

      {!error && shown.length === 0 && !loading && (
        <div className="glass-card p-8 text-center">
          <Zap className="mx-auto mb-3 size-7 text-muted" />
          <h3 className="text-base font-semibold">No runs recorded yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Every time a rule fires — or you press Test / Run now on the canvas — the steps it took
            and the outcome appear here, so you can prove what the system did on its own.
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-glass-2 text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">What happened</th>
                <th className="px-4 py-3 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((run) => {
                const retryable = run.status === "failed" || run.status === "dead";
                return (
                  <tr key={run.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <strong className="font-medium text-foreground">{run.workflow}</strong>
                      <p className="text-[11px] text-muted">{run.trigger}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {new Date(run.startedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`auto-run__status is-${run.status}`}>
                        {run.status === "dead" ? "gave up" : run.status}
                      </span>
                    </td>
                    <td
                      className="hidden max-w-[420px] px-4 py-3 text-muted md:table-cell"
                      title={run.log}
                    >
                      <p className="truncate">{run.log || "—"}</p>
                      {retryable && (
                        <p className="mt-0.5 text-[11px]">
                          {run.status === "dead"
                            ? `Tried ${run.attempts} times, then stopped`
                            : run.nextAttemptAt
                              ? `Attempt ${run.attempts} of 3 · next try ${new Date(
                                  run.nextAttemptAt,
                                ).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : `Attempt ${run.attempts} of 3`}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {retryable ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === run.id}
                            onClick={() => void retry(run.id)}
                          >
                            {busy === run.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                            Try again
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === run.id}
                            onClick={() => void discard(run.id)}
                            title="Stop retrying this run"
                          >
                            <Ban className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted">
                          {run.status === "discarded" ? "Will not run again" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
