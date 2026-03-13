export const TASKS = [
    { id: 1, title: "Aufgabe 1: Überblick verschaffen", category: "Planung" },
    { id: 2, title: "Aufgabe 2: Details prüfen", category: "Analyse" },
    { id: 3, title: "Aufgabe 3: Bearbeitung starten", category: "Umsetzung" },
    { id: 4, title: "Aufgabe 4: Zwischenstand speichern", category: "Umsetzung" },
    { id: 5, title: "Aufgabe 5: Abschließen", category: "Abschluss" },
    { id: 6, title: "Aufgabe 6: Review", category: "Qualität" },
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