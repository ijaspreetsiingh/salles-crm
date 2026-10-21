import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO, subMonths } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, EmptyState, Status } from "./common";
import { Btn, EmptyState as SmartEmpty, FilterMenu, Panel, Segmented } from "./ui";
import { Page, PageIdentity } from "./page";
import { formatDay, isoToday, type Task } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";

/* ==========================================================================
   Tasks.

   The page opens on "My day" — the things that are late, the things that
   are due today, and the things coming up. It is a list, not a calendar
   you have to interpret. The calendar is one click away for people who
   want to move things around.
   ========================================================================== */

type Bucket = {
  id: string;
  label: string;
  hint: string;
  tone: "overdue" | "today" | "soon" | "later";
  tasks: Task[];
};

export function Tasks() {
  const { tasks, addTask, toggleTask, updateTask, settings, user } = useCRM();
  const [view, setView] = useState<"My day" | "Everything" | "Calendar" | "Done">("My day");
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [day, setDay] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [owner, setOwner] = useState("Everyone");

  const today = isoToday();
  const activeEmployees = settings.employees.filter((e) => e.active);
  const me = user?.name ?? activeEmployees[0]?.name ?? "";
  const ownerOptions = ["Everyone", ...activeEmployees.map((e) => e.name)];

  const mine = useMemo(
    () => tasks.filter((t) => (owner === "Everyone" ? true : t.owner === owner)),
    [tasks, owner],
  );

  const searched = useMemo(
    () =>
      mine.filter(
        (t) =>
          (view !== "Done" ? !t.done : t.done) &&
          (view === "Everything" || t.owner === me) &&
          (!query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [mine, view, query, me],
  );

  /** The day, split into four plain-language buckets. */
  const buckets = useMemo<Bucket[]>(() => {
    const overdue: Task[] = [];
    const todayBucket: Task[] = [];
    const soon: Task[] = [];
    const later: Task[] = [];

    for (const task of searched) {
      if (task.done) continue;
      if (task.date < today) overdue.push(task);
      else if (task.date === today) todayBucket.push(task);
      else {
        const parsed = parseISO(task.date);
        if (isTomorrow(parsed)) soon.push(task);
        else later.push(task);
      }
    }

    const byDate = (a: Task, b: Task) => a.date.localeCompare(b.date);
    overdue.sort(byDate);
    todayBucket.sort(byDate);
    soon.sort(byDate);
    later.sort(byDate);

    const buckets: Bucket[] = (
      [
        {
          id: "overdue",
          label: "Late",
          hint: "These should have been done already.",
          tone: "overdue",
          tasks: overdue,
        },
        {
          id: "today",
          label: "Today",
          hint: "What you said you would do today.",
          tone: "today",
          tasks: todayBucket,
        },
        {
          id: "soon",
          label: "Tomorrow",
          hint: "Coming up next.",
          tone: "soon",
          tasks: soon,
        },
        {
          id: "later",
          label: "Later",
          hint: "Not urgent yet.",
          tone: "later",
          tasks: later,
        },
      ] satisfies Bucket[]
    ).filter((bucket) => bucket.tasks.length > 0);
    return buckets;
  }, [searched, today]);

  const openCount = searched.filter((t) => !t.done).length;
  const lateCount = tasks.filter((t) => !t.done && t.date < today).length;

  return (
    <>
      <Page
        identity={
          <PageIdentity
            eyebrow="Today"
            title="Things to do"
            purpose="Every promise you made, in one list. Tick things off as you go."
            stats={[
              {
                icon: <ListTodo className="size-4" />,
                value: String(openCount),
                label: "Still to do",
                tone: "neutral",
              },
              {
                icon: <CalendarDays className="size-4" />,
                value: String(tasks.filter((t) => t.date === today && !t.done).length),
                label: "Due today",
                tone: "butter",
              },
              {
                icon: <X className="size-4" />,
                value: String(lateCount),
                label: "Late",
                tone: "tomato",
              },
              {
                icon: <CircleCheck className="size-4" />,
                value: String(tasks.filter((t) => t.done).length),
                label: "Done",
                tone: "pine",
              },
            ]}
            actions={
              <Btn tone="primary" icon={<Plus />} onClick={() => setCreate(true)}>
                Add a task
              </Btn>
            }
          />
        }
        switchboard={
          <>
            <Segmented
              options={["My day", "Everything", "Calendar", "Done"]}
              value={view}
              onChange={(next) => {
                setView(next as typeof view);
                setDay(null);
              }}
              label="Task views"
            />
            <div className="switchboard__spacer" />
            <FilterMenu label="Who" value={owner} options={ownerOptions} onChange={setOwner} />
            <div className="switchboard__search">
              <Search className="size-4" />
              <input
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </>
        }
        work={
          view === "Calendar" ? (
            <Panel>
              <div className="section-heading">
                <h2>
                  {new Date(year, month).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Previous month"
                    onClick={() => {
                      const prev = subMonths(new Date(year, month), 1);
                      setMonth(prev.getMonth());
                      setYear(prev.getFullYear());
                      setDay(null);
                    }}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Next month"
                    onClick={() => {
                      const next = subMonths(new Date(year, month), 1);
                      setMonth(next.getMonth());
                      setYear(next.getFullYear());
                      setDay(null);
                    }}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <div className="calendar-grid">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <span className="calendar-weekday" key={d}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => (
                  <span className="calendar-blank" key={`blank-${i}`} />
                ))}
                {Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
                  const iso = format(new Date(year, month, i + 1), "yyyy-MM-dd");
                  const dayTasks = tasks.filter((t) => t.date === iso);
                  return (
                    <Button
                      variant="ghost"
                      key={iso}
                      className={`calendar-day ${iso === today ? "today" : ""} ${day === iso ? "active" : ""} ${dropTarget === iso ? "calendar-dropping" : ""}`}
                      onClick={() => setDay(day === iso ? null : iso)}
                      aria-label={`Tasks for ${formatDay(iso)}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTarget(iso);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDropTarget((prev) => (prev === iso ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTarget(null);
                        const taskId = dragged;
                        if (taskId == null) return;
                        const task = tasks.find((x) => x.id === taskId);
                        if (task) {
                          updateTask({ ...task, date: iso });
                          toast.success("Task moved");
                        }
                        setDragged(null);
                      }}
                    >
                      <span>{i + 1}</span>
                      {dayTasks.map((t) => (
                        <small
                          key={t.id}
                          className={`task-pill ${dragged === t.id ? "dragging" : ""}`}
                          draggable
                          onDragStart={() => setDragged(t.id)}
                          onDragEnd={() => setDragged(null)}
                        >
                          {t.title}
                        </small>
                      ))}
                    </Button>
                  );
                })}
              </div>
            </Panel>
          ) : view === "Done" ? (
            searched.length === 0 ? (
              <SmartEmpty
                icon={<CircleCheck size={22} />}
                title="Nothing finished yet"
                description="Completed tasks collect here, so you can see what you have got through."
              />
            ) : (
              <TaskList tasks={searched} onToggle={toggleTask} onEdit={setEditing} />
            )
          ) : buckets.length === 0 ? (
            <SmartEmpty
              icon={<CircleCheck size={22} />}
              title={view === "My day" ? "Your day is clear" : "No tasks here"}
              description={
                view === "My day"
                  ? "Nothing is late and nothing is due today. Add a task when you promise someone something."
                  : "Add a task and it will appear here on the day it is due."
              }
              steps={[
                "Write what you need to do",
                "Pick the day it is due",
                "It shows up on that day",
              ]}
              actions={
                <Btn tone="primary" icon={<Plus />} onClick={() => setCreate(true)}>
                  Add a task
                </Btn>
              }
            />
          ) : (
            <div className="space-y-5">
              {buckets.map((bucket) => (
                <section key={bucket.id}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                      {bucket.label}
                    </h2>
                    <span className="text-[12px] text-muted">{bucket.hint}</span>
                    <span className="ml-auto text-[12px] font-semibold text-faint tabular-nums">
                      {bucket.tasks.length}
                    </span>
                  </div>
                  <TaskList
                    tasks={bucket.tasks}
                    onToggle={toggleTask}
                    onEdit={setEditing}
                    tone={bucket.tone}
                  />
                </section>
              ))}
            </div>
          )
        }
        footer={
          <>
            <span>
              {openCount} to do · {tasks.filter((t) => t.done).length} done
            </span>
            <span>
              Press <kbd>/</kbd> to search · <kbd>n</kbd> to create · <kbd>?</kbd> for shortcuts
            </span>
          </>
        }
      />

      {(create || editing) && (
        <TaskDialog
          task={editing}
          onClose={() => {
            setCreate(false);
            setEditing(null);
          }}
          onSave={(task) => {
            if (editing) {
              updateTask(task as Task);
              toast.success("Task updated");
            } else {
              addTask(task as Omit<Task, "id">);
              toast.success("Task added");
            }
            setCreate(false);
            setEditing(null);
          }}
          owners={ownerOptions.filter((o) => o !== "Everyone")}
          defaultOwner={me}
        />
      )}
    </>
  );
}

function TaskList({
  tasks,
  onToggle,
  onEdit,
  tone,
}: {
  tasks: Task[];
  onToggle: (id: string, done: boolean) => void;
  onEdit: (task: Task) => void;
  tone?: "overdue" | "today" | "soon" | "later";
}) {
  return (
    <ul className="tasklist" role="list">
      {tasks.map((task) => (
        <li key={task.id} className={`tasklist__row ${tone ? `tasklist__row--${tone}` : ""}`}>
          <button
            type="button"
            className="tasklist__check"
            onClick={() => onToggle(task.id, !task.done)}
            aria-label={
              task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`
            }
            aria-pressed={task.done}
          >
            {task.done && <Check className="size-3.5" />}
          </button>
          <div className="tasklist__body">
            <p className={task.done ? "is-done" : ""}>{task.title}</p>
            <span>
              {task.type} · {formatDay(task.date)}
              {task.priority !== "Normal" && ` · ${task.priority}`}
            </span>
          </div>
          <span className="tasklist__owner">
            <Avatar name={task.owner || "?"} size="tiny" />
            {task.owner ? task.owner.split(" ")[0] : "Unassigned"}
          </span>
          <button
            type="button"
            className="tasklist__edit"
            onClick={() => onEdit(task)}
            aria-label={`Edit "${task.title}"`}
          >
            <Pencil className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskDialog({
  task,
  onClose,
  onSave,
  owners,
  defaultOwner,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, "id"> & { id?: string | undefined }) => void;
  owners: string[];
  defaultOwner: string;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.date ?? isoToday());
  const [priority, setPriority] = useState(task?.priority ?? "Normal");
  const [owner, setOwner] = useState(task?.owner ?? defaultOwner);
  const [type, setType] = useState(task?.type ?? "Sales follow-up");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Change the task" : "Add a task"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Update what it says and when it is due."
              : "What do you need to remember to do?"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onSave({
              ...(task ?? {}),
              id: task?.id,
              title: title.trim(),
              type,
              owner,
              date,
              priority,
              done: task?.done ?? false,
            });
          }}
        >
          <label className="full-width">
            What do you need to do?
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call Priya about the Bali dates"
            />
          </label>
          <label>
            When is it due?
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            How important?
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {["Low", "Normal", "High", "Urgent"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Who is doing it?
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            What kind of task?
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "Sales follow-up",
                "Ticketing",
                "Payment collection",
                "Documents",
                "Trip operations",
                "Customer care",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="dialog-actions full-width">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              <Check /> {task ? "Save changes" : "Add task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
