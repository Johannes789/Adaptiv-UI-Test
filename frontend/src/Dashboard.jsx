import React, { useEffect, useMemo, useState } from "react";
import { TASKS, ACTIONS, TEST_TASKS } from "./data";
import {
  getLayout,
  logEvent,
  getExportCsvUrl,
  getExportSummaryCsvUrl,
} from "./api";

const baseButtonStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cfcfcf",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};

const disabledButtonStyle = {
  ...baseButtonStyle,
  background: "#f1f1f1",
  color: "#888888",
  cursor: "not-allowed",
};

const primaryButtonStyle = {
  ...baseButtonStyle,
  background: "#eaf1ff",
  border: "1px solid #9ab6ff",
};

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
    const [openedTaskId, setOpenedTaskId] = useState(null);
    const [showDetails, setShowDetails] = useState(false);4
    const [isEditing, setIsEditing] = useState(false);
    const [taskNotes, setTaskNotes] = useState({});
    const [taskStatuses, setTaskStatuses] = useState({});
    const [taskOpenSince, setTaskOpenSince] = useState(null);
    const [taskStartTimes, setTaskStartTimes] = useState({});
    const [currentTestTaskIndex, setCurrentTestTaskIndex] = useState(0);
    const [testTaskStartTime, setTestTaskStartTime] = useState(null);
    const [lastActionKey, setLastActionKey] = useState(null);
    const [lastActionTaskId, setLastActionTaskId] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");
    const [completedTaskIds, setCompletedTaskIds] = useState([]);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [isSessionRunning, setIsSessionRunning] = useState(false);
    const [sessionStartTime, setSessionStartTime] = useState(null);
    const [sessionCompleted, setSessionCompleted] = useState(false);
    const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const l = await getLayout(userId, condition);
        if (!cancelled) setLayout(l);
      } catch (e) {
        if (!cancelled) {
          setError(String(e.message || e));
        }
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
    return [...TASKS].sort(
      (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
    );
  }, [layout]);

  const highlighted = useMemo(
    () => new Set(layout?.highlighted_actions || []),
    [layout]
  );

  const selectedTask = TASKS.find((t) => t.id === selectedTaskId) || null;
  const openedTask = TASKS.find((t) => t.id === openedTaskId) || null;

  const currentTestTask = TEST_TASKS[currentTestTaskIndex] || null;
  const totalTestTasks = TEST_TASKS.length;
  const currentStep = Math.min(currentTestTaskIndex + 1, totalTestTasks);
  const progressPercent =
    totalTestTasks > 0 ? Math.round((currentStep / totalTestTasks) * 100) : 0;
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

    setStatusMessage(`Aufgabe ${taskId} wurde ausgewählt.`);
  }

  async function onAction(actionKey) {
    if (!selectedTaskId) {
      setStatusMessage("Bitte wählen Sie zuerst eine Aufgabe aus.");
      return;
    }
  
    await logEvent({
      user_id: userId,
      condition,
      event_type: "click_action",
      target: `action:${actionKey}`,
      ts: nowIso(),
      meta: { task_id: selectedTaskId },
    }).catch(() => {});
  
    setLastActionKey(actionKey);
    setLastActionTaskId(selectedTaskId);
  
    if (actionKey === "open") {
      setOpenedTaskId(selectedTaskId);
      setShowDetails(false);
      setIsEditing(false);
      setStatusMessage(`Aufgabe ${selectedTaskId} wurde geöffnet.`);
      return;
    }
  
    if (actionKey === "details") {
      setOpenedTaskId(selectedTaskId);
      setShowDetails(true);
      setIsEditing(false);
      setStatusMessage(`Details für Aufgabe ${selectedTaskId} werden angezeigt.`);
      return;
    }
  
    if (actionKey === "edit") {
      setOpenedTaskId(selectedTaskId);
      setIsEditing(true);
      setShowDetails(false);
      setStatusMessage(`Aufgabe ${selectedTaskId} befindet sich im Bearbeitungsmodus.`);
      return;
    }
  
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
  
        setTaskStartTimes((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
  
      setTaskStatuses((prev) => ({
        ...prev,
        [selectedTaskId]: "abgeschlossen",
      }));
  
      setOpenedTaskId(selectedTaskId);
      setShowDetails(false);
      setIsEditing(false);
  
      setStatusMessage(`Aufgabe ${selectedTaskId} wurde abgeschlossen.`);
      setCompletedTaskIds((prev) =>
        prev.includes(selectedTaskId) ? prev : [...prev, selectedTaskId]
      );
    }
  }

  async function refreshLayout() {
    if (condition !== "adaptive") {
      setStatusMessage(
        "Die adaptive Anordnung kann nur in der adaptiven Versuchsbedingung angewendet werden."
      );
      return;
    }

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

      setStatusMessage("Die adaptive Anordnung wurde aktualisiert.");
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function startCurrentTestTask() {
    if (!currentTestTask || !isSessionRunning) {
        setStatusMessage("Bitte starten Sie zuerst die Testsession.");
        return;
      }

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

    setStatusMessage(`Testaufgabe ${currentTestTask.id} wurde gestartet.`);
  }

  async function completeCurrentTestTask() {
    if (!currentTestTask || !testTaskStartTime) return;

    const durationMs = Date.now() - testTaskStartTime;

    let success = true;
    let successReason = "Erwartete Aktion erfolgreich ausgeführt.";

    if (
      currentTestTask.expectedAction &&
      lastActionKey !== currentTestTask.expectedAction
    ) {
      success = false;
      successReason = `Erwartete Aktion '${currentTestTask.expectedAction}' wurde nicht ausgeführt.`;
    }

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

    if (condition === "adaptive") {
        try {
          const l = await getLayout(userId, "adaptive");
          setLayout(l);
        } catch (e) {
          setError(String(e.message || e));
        }
      }

    setStatusMessage(
      success
        ? `Testaufgabe ${currentTestTask.id} erfolgreich abgeschlossen.`
        : `Testaufgabe ${currentTestTask.id} nicht erfolgreich: ${successReason}`
    );

    setTestTaskStartTime(null);

    if (currentTestTaskIndex < TEST_TASKS.length - 1) {
        setCurrentTestTaskIndex((prev) => prev + 1);
      } else {
        setStatusMessage("Alle Testaufgaben wurden bearbeitet.");
        setIsSessionRunning(false);
        setSessionCompleted(true);
      
        if (sessionStartTime) {
          const durationMs = Date.now() - sessionStartTime;
      
          await logEvent({
            user_id: userId,
            condition,
            event_type: "test_session_end",
            target: `session:${condition}`,
            ts: nowIso(),
            meta: {
              session_condition: condition,
              duration_ms: durationMs,
              completed_test_tasks: TEST_TASKS.length,
            },
          }).catch(() => {});
        }
      
        setSessionStartTime(null);
      }
  }

  function handleNoteChange(taskId, value) {
    setTaskNotes((prev) => ({
      ...prev,
      [taskId]: value,
    }));
  }

  async function startTestSessionWithCondition(sessionCondition) {
    const startTs = Date.now();
  
    setCondition(sessionCondition);
    setIsSessionRunning(true);
    setSessionCompleted(false);
    setSessionStartTime(startTs);
    setCurrentTestTaskIndex(0);
    setTestTaskStartTime(null);
    setLastActionKey(null);
    setLastActionTaskId(null);
    setCompletedTaskIds([]);
    setTaskStatuses({});
    setTaskNotes({});
    setOpenedTaskId(null);
    setSelectedTaskId(null);
    setShowDetails(false);
    setIsEditing(false);
  
    try {
      const l = await getLayout(userId, sessionCondition);
      setLayout(l);
    } catch (e) {
      setError(String(e.message || e));
    }
  
    await logEvent({
      user_id: userId,
      condition: sessionCondition,
      event_type: "test_session_start",
      target: `session:${sessionCondition}`,
      ts: nowIso(),
      meta: {
        session_condition: sessionCondition,
      },
    }).catch(() => {});
  
    setStatusMessage(`Testsession in der Bedingung "${sessionCondition}" wurde gestartet.`);
  }

  async function endTestSession() {
    if (!isSessionRunning || !sessionStartTime) return;
  
    const durationMs = Date.now() - sessionStartTime;
  
    await logEvent({
      user_id: userId,
      condition,
      event_type: "test_session_end",
      target: `session:${condition}`,
      ts: nowIso(),
      meta: {
        session_condition: condition,
        duration_ms: durationMs,
        completed_test_tasks: currentTestTaskIndex >= TEST_TASKS.length ? TEST_TASKS.length : currentTestTaskIndex,
      },
    }).catch(() => {});
  
    setIsSessionRunning(false);
    setSessionCompleted(true);
    setSessionStartTime(null);
    setTestTaskStartTime(null);
  
    setStatusMessage("Testsession wurde beendet.");
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 20,
        fontFamily: "system-ui, Arial, sans-serif",
        color: "#111111",
        background: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 28, color: "#000000", }}>
          Aufgaben-Dashboard
        </h1>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Prototyp zur Untersuchung statischer und adaptiver Benutzeroberflächen
          im Kontext der User Experience.
        </div>
      </div>

      <div
        style={{
          border: "1px solid #dcdcdc",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          background: "#fafafa",
        }}
      >
        <button
          onClick={() => setShowAdminPanel((prev) => !prev)}
          style={baseButtonStyle}
        >
          {showAdminPanel
            ? "Technischen Bereich ausblenden"
            : "Technischen Bereich anzeigen"}
        </button>
      </div>

      {showAdminPanel ? (
        <>
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
              Hier können die erfassten Testdaten als CSV-Dateien
              heruntergeladen werden.
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <a
                href={getExportCsvUrl(userId)}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...baseButtonStyle,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Rohdaten CSV (aktuelle Testperson)
              </a>

              <a
                href={getExportSummaryCsvUrl(userId)}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...baseButtonStyle,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Summary CSV (aktuelle Testperson)
              </a>

              <a
                href={getExportCsvUrl()}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...baseButtonStyle,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Rohdaten CSV (alle)
              </a>

              <a
                href={getExportSummaryCsvUrl()}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...baseButtonStyle,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Summary CSV (alle)
              </a>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              background: "#ffffff",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
              Versuchsbedingung
            </h3>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <label style={{ fontSize: 14 }}>
                Bedingung:&nbsp;
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #cfcfcf",
                    background: "#fff",
                    color: "#111",
                  }}
                >
                  <option value="static">Statisch</option>
                  <option value="adaptive">Adaptiv</option>
                </select>
              </label>

              <button
                onClick={refreshLayout}
                style={
                  condition === "adaptive"
                    ? baseButtonStyle
                    : disabledButtonStyle
                }
                disabled={condition !== "adaptive"}
              >
                Adaptive Anordnung anwenden
              </button>

              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Aktuelle Test-ID:&nbsp;
                <span style={{ fontFamily: "monospace" }}>{userId}</span>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          background: "#fffdf7",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          Hinweise für Testpersonen
        </h3>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Bearbeiten Sie die Aufgaben möglichst ohne Hilfe.</li>
          <li>Konzentrieren Sie sich auf die aktuell angezeigte Testaufgabe.</li>
          <li>Nutzen Sie das Dashboard so natürlich wie möglich.</li>
          <li>
            Schließen Sie jede Testaufgabe erst nach Bearbeitung über die
            entsprechende Schaltfläche ab.
          </li>
        </ul>
      </div>

      <div
  style={{
    border: "1px solid #d8e6d2",
    background: "#f8fff5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <div>
      <h3 style={{ margin: 0 }}>Testsession</h3>
      <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
        Starten Sie die Testsitzung, bevor Sie mit der Bearbeitung der Testaufgaben beginnen.
      </div>
    </div>

    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: isSessionRunning ? "#e7f7ea" : sessionCompleted ? "#eaf1ff" : "#f1f1f1",
        fontSize: 12,
        fontWeight: 600,
        color: "#111111",
      }}
    >
      {isSessionRunning
        ? "Session läuft"
        : sessionCompleted
        ? "Session abgeschlossen"
        : "Session nicht gestartet"}
    </div>
  </div>

  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
  <button
        onClick={() => startTestSessionWithCondition("static")}
        disabled={isSessionRunning}
        style={isSessionRunning ? disabledButtonStyle : primaryButtonStyle}
        >
        Testsession starten – Statisch
    </button>

    <button
        onClick={() => startTestSessionWithCondition("adaptive")}
        disabled={isSessionRunning}
        style={isSessionRunning ? disabledButtonStyle : primaryButtonStyle}
        >
        Testsession starten – Adaptiv
    </button>

    <button
      onClick={endTestSession}
      disabled={!isSessionRunning}
      style={!isSessionRunning ? disabledButtonStyle : baseButtonStyle}
    >
      Testsession beenden
    </button>
  </div>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Testaufgabe</h3>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              Bearbeiten Sie die Aufgabe möglichst selbstständig und
              konzentriert.
            </div>
          </div>

          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: isTestTaskRunning ? "#e7f7ea" : "#f1f1f1",
              fontSize: 12,
              fontWeight: 600,
              color: "#111111",
            }}
          >
            {isTestTaskRunning ? "Läuft" : "Noch nicht gestartet"}
          </div>
        </div>

        <div style={{ marginTop: 14, marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 6,
            }}
          >
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
              <div style={{ fontWeight: 600, color: "#111111" }}>
                Aufgabe {currentTestTask.id}: {currentTestTask.instruction}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={startCurrentTestTask}
                disabled={isTestTaskRunning || !isSessionRunning}
                style={isTestTaskRunning || !isSessionRunning ? disabledButtonStyle : primaryButtonStyle}
              >
                Testaufgabe starten
              </button>

              <button
                onClick={completeCurrentTestTask}
                disabled={!isTestTaskRunning}
                style={!isTestTaskRunning ? disabledButtonStyle : baseButtonStyle}
              >
                Testaufgabe abschließen
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 12 }}>Keine Testaufgabe verfügbar.</div>
        )}
      </div>

      {statusMessage ? (
        <div
          style={{
            border: "1px solid #d8e6d2",
            background: "#f3fbef",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            color: "#173b12",
          }}
        >
          <strong>Status:</strong> {statusMessage}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            background: "#ffe3e3",
            color: "#611a15",
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
            border: "1px solid #f1b6b6",
          }}
        >
          <b>Fehler:</b> {error}
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Prüfen Sie, ob das Backend läuft:
            <code> uvicorn app.main:app --reload --port 8000</code>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.25fr 0.9fr",
          gap: 16,
        }}
      >
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
            background: "#ffffff",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Aufgabenübersicht</h3>

          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            {condition === "adaptive"
              ? "In dieser Bedingung können häufig genutzte Elemente bevorzugt angeordnet oder hervorgehoben werden."
              : "In dieser Bedingung bleibt die Oberfläche in einer festen Anordnung."}
          </div>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {orderedTasks.map((t) => {
              const isActive = selectedTaskId === t.id;
              const isCompleted = completedTaskIds.includes(t.id);
              const rationale = layout?.rationale?.[`task:${t.id}`];

              return (
                <li
                  key={t.id}
                  onClick={() => onSelectTask(t.id)}
                  style={{
                    cursor: "pointer",
                    border: "1px solid #e6e6e6",
                    borderRadius: 10,
                    padding: 12,
                    background: isActive ? "#f4f7ff" : "white",
                    boxShadow: isActive ? "0 0 0 2px #9ab6ff inset" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    opacity: isCompleted ? 0.8 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#111111" }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {t.category}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: "#374151" }}>
                        Status: <b>{taskStatuses[t.id] || "offen"}</b>
                    </div>

                    {isCompleted ? (
                      <div
                        style={{
                          fontSize: 12,
                          marginTop: 6,
                          color: "#1f6f2b",
                          fontWeight: 600,
                        }}
                      >
                        Abgeschlossen
                      </div>
                    ) : null}

                    {condition === "adaptive" && rationale ? (
                      <div
                        style={{
                          fontSize: 12,
                          marginTop: 6,
                          opacity: 0.85,
                          color: "#1f2937",
                        }}
                      >
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

        <div
            style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#ffffff",
            }}
            >
            <h3 style={{ marginTop: 0 }}>Arbeitsbereich</h3>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
                Wählen Sie eine Aufgabe aus und führen Sie anschließend eine Aktion aus.
            </div>

            <div style={{ marginBottom: 12, fontSize: 14 }}>
                Ausgewählte Aufgabe:{" "}
                <b>
                {selectedTaskId ? `Aufgabe ${selectedTaskId}` : "Keine Aufgabe ausgewählt"}
                </b>
            </div>

            <div
                style={{
                marginBottom: 14,
                fontSize: 13,
                lineHeight: 1.6,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 10,
                }}
            >
                <div>
                <b>Öffnen:</b> Aufgabe im Arbeitsbereich anzeigen
                </div>
                <div>
                <b>Bearbeiten:</b> Bearbeitungsnotiz erfassen
                </div>
                <div>
                <b>Details:</b> Zusatzinformationen anzeigen
                </div>
                <div>
                <b>Abschließen:</b> Aufgabe als abgeschlossen markieren
                </div>
            </div>

            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                {ACTIONS.map((a) => {
                const isHighlighted = highlighted.has(a.key);
                const rationale = layout?.rationale?.[`action:${a.key}`];

                return (
                    <button
                    key={a.key}
                    disabled={!selectedTaskId}
                    onClick={() => onAction(a.key)}
                    style={
                        !selectedTaskId
                        ? { ...disabledButtonStyle, textAlign: "left" }
                        : isHighlighted
                        ? { ...primaryButtonStyle, textAlign: "left" }
                        : { ...baseButtonStyle, textAlign: "left" }
                    }
                    title={condition === "adaptive" && rationale ? rationale : ""}
                    >
                    <div style={{ color: "#111111" }}>{a.label}</div>

                    {condition === "adaptive" && rationale ? (
                        <div
                        style={{
                            fontSize: 12,
                            opacity: 0.8,
                            marginTop: 4,
                            color: "#374151",
                        }}
                        >
                        {rationale}
                        </div>
                    ) : null}
                    </button>
                );
                })}
            </div>

            <div
                style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                background: "#fcfcfd",
                minHeight: 260,
                }}
            >
                {!openedTask ? (
                <div style={{ color: "#6b7280", fontSize: 14 }}>
                    Noch keine Aufgabe geöffnet. Wählen Sie eine Aufgabe aus und klicken Sie auf „Öffnen“, „Bearbeiten“ oder „Details“.
                </div>
                ) : (
                <>
                    <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                        Geöffnete Aufgabe
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#111111" }}>
                        {openedTask.title}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                        Kategorie: {openedTask.category}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                        Status:{" "}
                        <b>{taskStatuses[openedTask.id] || "offen"}</b>
                    </div>
                    </div>

                    <div
                    style={{
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 12,
                        marginTop: 12,
                    }}
                    >
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: "#111111" }}>
                        {openedTask.description}
                    </div>

                    {showDetails ? (
                        <div
                        style={{
                            marginTop: 14,
                            padding: 12,
                            borderRadius: 10,
                            background: "#f7f9ff",
                            border: "1px solid #dfe6ff",
                        }}
                        >
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                            Detailinformationen
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                            {openedTask.details}
                        </div>
                        </div>
                    ) : null}

                    {isEditing ? (
                        <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                            Bearbeitungsnotiz
                        </div>
                        <textarea
                            value={taskNotes[openedTask.id] || ""}
                            onChange={(e) => handleNoteChange(openedTask.id, e.target.value)}
                            placeholder="Hier können Bearbeitungsnotizen zur Aufgabe erfasst werden."
                            style={{
                            width: "100%",
                            minHeight: 120,
                            padding: 12,
                            borderRadius: 10,
                            border: "1px solid #cfcfcf",
                            fontFamily: "inherit",
                            fontSize: 14,
                            resize: "vertical",
                            color: "#111111",
                            background: "#ffffff",
                            }}
                        />
                        </div>
                    ) : null}
                    </div>
                </>
                )}
            </div>

            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
                In der adaptiven Bedingung können hervorgehobene Aktionen als Unterstützung angezeigt werden.
            </div>
            </div>
      </div>
    </div>
  );
}
