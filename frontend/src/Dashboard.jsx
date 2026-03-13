import React, { useEffect, useMemo, useState } from "react";
import { TASKS, ACTIONS, TEST_TASKS } from "./data";
import {
    getLayout,
    logEvent,
    getExportCsvUrl,
    getExportSummaryCsvUrl,
  } from "./api";

function nowIso() {
  return new Date().toISOString();
}

function makeUserId() {
  const key = "ux_user_id";
  let v = localStorage.getItem(key);
  if (!v) {
    v = `u_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    localStorage.setItem(key, v);
  }
  return v;
}

export default function Dashboard() {
  const userId = useMemo(() => makeUserId(), []);
  const [condition, setCondition] = useState("static");
  const [layout, setLayout] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskOpenSince, setTaskOpenSince] = useState(null);
  const [taskStartTimes, setTaskStartTimes] = useState({});
  const [currentTestTaskIndex, setCurrentTestTaskIndex] = useState(0);
  const [testTaskStartTime, setTestTaskStartTime] = useState(null);
  const [lastActionKey, setLastActionKey] = useState(null);
  const [lastActionTaskId, setLastActionTaskId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const l = await getLayout(userId, condition);
        if (!cancelled) setLayout(l);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, condition]);

  useEffect(() => {
    logEvent({
      user_id: userId,
      condition,
      event_type: "switch_condition",
      target: `condition:${condition}`,
      ts: nowIso(),
      meta: {},
    }).catch(() => {});
  }, [userId, condition]);

  const orderedTasks = useMemo(() => {
    if (!layout?.ordered_task_ids) return TASKS;
    const order = new Map(layout.ordered_task_ids.map((id, idx) => [id, idx]));
    return [...TASKS].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }, [layout]);

  const highlighted = useMemo(() => new Set(layout?.highlighted_actions || []), [layout]);
  const currentTestTask = TEST_TASKS[currentTestTaskIndex] || null;
  const totalTestTasks = TEST_TASKS.length;
  const currentStep = currentTestTaskIndex + 1;
  const progressPercent = Math.round((currentStep / totalTestTasks) * 100);
  const isTestTaskRunning = testTaskStartTime !== null;

  async function onSelectTask(taskId) {
    if (selectedTaskId && taskOpenSince) {
      const dwellMs = Date.now() - taskOpenSince;
      await logEvent({
        user_id: userId,
        condition,
        event_type: "dwell_task",
        target: `task:${selectedTaskId}`,
        ts: nowIso(),
        meta: { dwell_ms: dwellMs },
      }).catch(() => {});
    }

    setSelectedTaskId(taskId);
    setTaskOpenSince(Date.now());

    await logEvent({
      user_id: userId,
      condition,
      event_type: "click_task",
      target: `task:${taskId}`,
      ts: nowIso(),
      meta: {},
    }).catch(() => {});

    // task_start nur setzen, wenn diese Aufgabe in dieser Bedingung noch nicht gestartet wurde
    const key = `${condition}_${taskId}`;
    if (!taskStartTimes[key]) {
      const startTs = Date.now();

      setTaskStartTimes((prev) => ({
        ...prev,
        [key]: startTs,
      }));

      await logEvent({
        user_id: userId,
        condition,
        event_type: "task_start",
        target: `task:${taskId}`,
        ts: nowIso(),
        meta: {},
      }).catch(() => {});
    }
  }

  async function onAction(actionKey) {
    if (!selectedTaskId) return;

    await logEvent({
      user_id: userId,
      condition,
      event_type: "click_action",
      target: `action:${actionKey}`,
      ts: nowIso(),
      meta: { task_id: selectedTaskId },
    }).catch(() => {});

    if (actionKey === "complete") {
      const key = `${condition}_${selectedTaskId}`;
      const startTs = taskStartTimes[key];

      if (startTs) {
        const durationMs = Date.now() - startTs;

        await logEvent({
          user_id: userId,
          condition,
          event_type: "task_complete",
          target: `task:${selectedTaskId}`,
          ts: nowIso(),
          meta: {
            task_id: selectedTaskId,
            duration_ms: durationMs,
          },
        }).catch(() => {});

        setLastActionKey(actionKey);
        setLastActionTaskId(selectedTaskId);

        // nach Abschluss entfernen, damit Aufgabe bei erneutem Öffnen neu gestartet werden kann
        setTaskStartTimes((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }

      alert(`Aufgabe ${selectedTaskId} abgeschlossen (Demo)`);
    } else {
      alert(`Aktion "${actionKey}" auf Aufgabe ${selectedTaskId} ausgeführt (Demo)`);
    }
  }

  async function refreshLayout() {
    setError("");
    try {
      const l = await getLayout(userId, condition);
      setLayout(l);

      await logEvent({
        user_id: userId,
        condition,
        event_type: "refresh_layout",
        target: "layout",
        ts: nowIso(),
        meta: {},
      }).catch(() => {});
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function startCurrentTestTask() {
    if (!currentTestTask) return;
    
    setLastActionKey(null);
    setLastActionTaskId(null);

    const startTs = Date.now();
    setTestTaskStartTime(startTs);
  
    await logEvent({
      user_id: userId,
      condition,
      event_type: "test_task_start",
      target: `test_task:${currentTestTask.id}`,
      ts: nowIso(),
      meta: {
        test_task_id: currentTestTask.id,
        instruction: currentTestTask.instruction,
        expected_action: currentTestTask.expectedAction,
        expected_task_id: currentTestTask.expectedTaskId,
      },
    }).catch(() => {});
  }

  async function completeCurrentTestTask() {
    if (!currentTestTask || !testTaskStartTime) return;
  
    const durationMs = Date.now() - testTaskStartTime;
  
    let success = true;
    let successReason = "Erwartete Aktion erfolgreich ausgeführt.";
  
    // Prüfen, ob erwartete Aktion ausgeführt wurde
    if (currentTestTask.expectedAction && lastActionKey !== currentTestTask.expectedAction) {
      success = false;
      successReason = `Erwartete Aktion '${currentTestTask.expectedAction}' wurde nicht ausgeführt.`;
    }
  
    // Falls eine konkrete Aufgabe erwartet wird, diese ebenfalls prüfen
    if (
      success &&
      currentTestTask.expectedTaskId !== null &&
      lastActionTaskId !== currentTestTask.expectedTaskId
    ) {
      success = false;
      successReason = `Erwartete Aufgabe '${currentTestTask.expectedTaskId}' wurde nicht korrekt bearbeitet.`;
    }
  
    await logEvent({
      user_id: userId,
      condition,
      event_type: "test_task_complete",
      target: `test_task:${currentTestTask.id}`,
      ts: nowIso(),
      meta: {
        test_task_id: currentTestTask.id,
        duration_ms: durationMs,
        selected_task_id: selectedTaskId,
        last_action_key: lastActionKey,
        last_action_task_id: lastActionTaskId,
        success,
        success_reason: successReason,
      },
    }).catch(() => {});
  
    alert(
      success
        ? `Testaufgabe ${currentTestTask.id} erfolgreich abgeschlossen.`
        : `Testaufgabe ${currentTestTask.id} nicht erfolgreich: ${successReason}`
    );
  
    setTestTaskStartTime(null);
  
    if (currentTestTaskIndex < TEST_TASKS.length - 1) {
      setCurrentTestTaskIndex((prev) => prev + 1);
    } else {
      alert("Alle Testaufgaben wurden bearbeitet.");
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, fontFamily: "system-ui, Arial" }}>
      <h2>Aufgaben-Dashboard</h2>

      <div
        style={{
            border: "1px solid #dcdcdc",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            background: "#fafafa",
        }}
        >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Datenexport</h3>

        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            Hier können die erfassten Testdaten als CSV-Dateien heruntergeladen werden.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a
            href={getExportCsvUrl(userId)}
            target="_blank"
            rel="noreferrer"
            style={{
                textDecoration: "none",
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: "10px 12px",
                background: "white",
                color: "black",
            }}
            >
            Rohdaten CSV (aktuelle Testperson)
            </a>

            <a
            href={getExportSummaryCsvUrl(userId)}
            target="_blank"
            rel="noreferrer"
            style={{
                textDecoration: "none",
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: "10px 12px",
                background: "white",
                color: "black",
            }}
            >
            Summary CSV (aktuelle Testperson)
            </a>

            <a
            href={getExportCsvUrl()}
            target="_blank"
            rel="noreferrer"
            style={{
                textDecoration: "none",
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: "10px 12px",
                background: "white",
                color: "black",
            }}
            >
            Rohdaten CSV (alle)
            </a>

            <a
            href={getExportSummaryCsvUrl()}
            target="_blank"
            rel="noreferrer"
            style={{
                textDecoration: "none",
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: "10px 12px",
                background: "white",
                color: "black",
            }}
            >
            Summary CSV (alle)
            </a>
        </div>
        </div>

        <div
            style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                background: "#fffdf7",
            }}
            >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Hinweise für Testpersonen</h3>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Bearbeiten Sie die Aufgaben möglichst ohne Hilfe.</li>
                <li>Konzentrieren Sie sich auf die aktuell angezeigte Testaufgabe.</li>
                <li>Nutzen Sie das Dashboard so natürlich wie möglich.</li>
                <li>Schließen Sie jede Testaufgabe erst nach Bearbeitung über die entsprechende Schaltfläche ab.</li>
            </ul>
            </div>

        <div
            style={{
                border: "1px solid #cfd8ff",
                background: "#f7f9ff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
            }}
            >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                <h3 style={{ margin: 0 }}>Testaufgabe</h3>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                    Bearbeiten Sie die Aufgabe möglichst selbstständig und konzentriert.
                </div>
                </div>

                <div
                style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: isTestTaskRunning ? "#e7f7ea" : "#f1f1f1",
                    fontSize: 12,
                    fontWeight: 600,
                }}
                >
                {isTestTaskRunning ? "Läuft" : "Noch nicht gestartet"}
                </div>
            </div>

            <div style={{ marginTop: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>
                    Fortschritt: Aufgabe {currentStep} von {totalTestTasks}
                </span>
                <span>{progressPercent}%</span>
                </div>

                <div
                style={{
                    width: "100%",
                    height: 10,
                    background: "#e5e7eb",
                    borderRadius: 999,
                    overflow: "hidden",
                }}
                >
                <div
                    style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: "#9ab6ff",
                    }}
                />
                </div>
            </div>

            {currentTestTask ? (
                <>
                <div
                    style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 10,
                    background: "white",
                    border: "1px solid #dfe6ff",
                    }}
                >
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Aktuelle Instruktion
                    </div>
                    <div style={{ fontWeight: 600 }}>
                    Aufgabe {currentTestTask.id}: {currentTestTask.instruction}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <button
                    onClick={startCurrentTestTask}
                    disabled={isTestTaskRunning}
                    style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: isTestTaskRunning ? "#f1f1f1" : "white",
                        cursor: isTestTaskRunning ? "not-allowed" : "pointer",
                    }}
                    >
                    Testaufgabe starten
                    </button>

                    <button
                    onClick={completeCurrentTestTask}
                    disabled={!isTestTaskRunning}
                    style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: !isTestTaskRunning ? "#f1f1f1" : "white",
                        cursor: !isTestTaskRunning ? "not-allowed" : "pointer",
                    }}
                    >
                    Testaufgabe abschließen
                    </button>
                </div>
                </>
            ) : (
                <div style={{ marginTop: 12 }}>Keine Testaufgabe verfügbar.</div>
            )}
            </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Test-ID (pseudonymisiert)</div>
          <div style={{ fontFamily: "monospace" }}>{userId}</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: 14 }}>
            Versuchsbedingung:&nbsp;
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="static">Statisch</option>
                <option value="adaptive">Adaptiv</option>
            </select>
        </label>

          <button onClick={refreshLayout}>Layout aktualisieren</button>
        </div>
      </div>

      {error ? (
        <div style={{ background: "#ffe3e3", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <b>Fehler:</b> {error}
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Prüfe, ob Backend läuft: <code>uvicorn app.main:app --reload --port 8000</code>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Aufgaben</h3>

          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            {condition === "adaptive"
              ? "Adaptiv: Reihenfolge basiert auf Interaktionen (Klicks/Verweildauer)."
              : "Statisch: Feste Reihenfolge (Kontrollbedingung)."}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {orderedTasks.map((t) => {
              const isActive = selectedTaskId === t.id;
              const rationale = layout?.rationale?.[`task:${t.id}`];

              return (
                <li
                  key={t.id}
                  onClick={() => onSelectTask(t.id)}
                  style={{
                    cursor: "pointer",
                    border: "1px solid #e6e6e6",
                    borderRadius: 10,
                    padding: 10,
                    background: isActive ? "#f4f7ff" : "white",
                    boxShadow: isActive ? "0 0 0 2px #9ab6ff inset" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{t.category}</div>
                    {condition === "adaptive" && rationale ? (
                      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
                        <b>Hinweis:</b> {rationale}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.6 }}>ID {t.id}</div>
                </li>
              );
            })}
          </ul>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Aktionen</h3>

          <div style={{ marginBottom: 10, fontSize: 14 }}>
            Ausgewählt: <b>{selectedTaskId ? `Aufgabe ${selectedTaskId}` : "— keine —"}</b>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {ACTIONS.map((a) => {
              const isHighlighted = highlighted.has(a.key);
              const rationale = layout?.rationale?.[`action:${a.key}`];

              return (
                <button
                  key={a.key}
                  disabled={!selectedTaskId}
                  onClick={() => onAction(a.key)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: selectedTaskId ? "pointer" : "not-allowed",
                    fontWeight: isHighlighted ? 700 : 600,
                    outline: isHighlighted ? "2px solid #9ab6ff" : "none",
                    background: "white",
                    textAlign: "left",
                  }}
                  title={condition === "adaptive" && rationale ? rationale : ""}
                >
                  {a.label}
                  {condition === "adaptive" && rationale ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {rationale}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
            Transparenz: In der adaptiven Version werden Gründe („Hinweis“) angezeigt.
          </div>
        </div>
      </div>
    </div>
  );
}