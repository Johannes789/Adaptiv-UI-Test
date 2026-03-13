export const TASKS = [
    {
      id: 1,
      title: "Aufgabe 1: Überblick verschaffen",
      category: "Planung",
      description: "Verschaffen Sie sich einen ersten Überblick über die verfügbaren Aufgaben und priorisieren Sie die nächsten Schritte.",
      details: "Diese Aufgabe dient der ersten Orientierung innerhalb des Dashboards und unterstützt die Einschätzung der Arbeitsreihenfolge.",
    },
    {
      id: 2,
      title: "Aufgabe 2: Details prüfen",
      category: "Analyse",
      description: "Prüfen Sie relevante Informationen und analysieren Sie die Anforderungen der ausgewählten Aufgabe.",
      details: "Im Detailbereich können zusätzliche Informationen zur Aufgabe sowie kontextbezogene Hinweise angezeigt werden.",
    },
    {
      id: 3,
      title: "Aufgabe 3: Bearbeitung starten",
      category: "Umsetzung",
      description: "Beginnen Sie mit der Bearbeitung der Aufgabe und dokumentieren Sie erste Arbeitsschritte.",
      details: "Für diese Aufgabe kann eine kurze Bearbeitungsnotiz erfasst werden, um Zwischenschritte sichtbar zu machen.",
    },
    {
      id: 4,
      title: "Aufgabe 4: Zwischenstand speichern",
      category: "Umsetzung",
      description: "Sichern Sie den Zwischenstand Ihrer Bearbeitung und halten Sie relevante Informationen fest.",
      details: "Zwischenstände helfen dabei, den Fortschritt nachvollziehbar zu dokumentieren.",
    },
    {
      id: 5,
      title: "Aufgabe 5: Abschließen",
      category: "Abschluss",
      description: "Schließen Sie eine Aufgabe ab, sobald die Bearbeitung erfolgreich beendet wurde.",
      details: "Abgeschlossene Aufgaben werden im Dashboard visuell markiert und können für spätere Auswertungen berücksichtigt werden.",
    },
    {
      id: 6,
      title: "Aufgabe 6: Review",
      category: "Qualität",
      description: "Überprüfen Sie die bisherige Bearbeitung und bewerten Sie den aktuellen Stand der Aufgabe.",
      details: "Die Review-Phase dient der Qualitätssicherung und kann zur Vorbereitung des finalen Abschlusses genutzt werden.",
    },
  ];
  
  export const ACTIONS = [
    { key: "open", label: "Öffnen" },
    { key: "edit", label: "Bearbeiten" },
    { key: "complete", label: "Abschließen" },
    { key: "details", label: "Details" },
  ];
  
  export const TEST_TASKS = [
    {
      id: 1,
      instruction: "Finden Sie die Aufgabe mit der höchsten Priorität und öffnen Sie diese.",
      expectedTaskId: 1,
      expectedAction: "open",
    },
    {
      id: 2,
      instruction: "Bearbeiten Sie eine Aufgabe Ihrer Wahl.",
      expectedTaskId: null,
      expectedAction: "edit",
    },
    {
      id: 3,
      instruction: "Schließen Sie eine Aufgabe ab.",
      expectedTaskId: null,
      expectedAction: "complete",
    },
    {
      id: 4,
      instruction: "Öffnen Sie die Detailansicht einer Aufgabe.",
      expectedTaskId: null,
      expectedAction: "details",
    },
  ];