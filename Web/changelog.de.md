# Neuerungen

Deutsche Übersetzung von `CHANGELOG.md` (Italienisch), gelesen von der App und der Website. Jede Version fügt allen fünf Dateien (`CHANGELOG.md`, `.en`, `.fr`, `.de`, `.es`) denselben Abschnitt hinzu, mit denselben Punkten in derselben Reihenfolge: ein Test prüft das.

## 0.7.0 — 21. Oktober 2026

- Automatisierungen (Workspace-Menü, Administratoren): Bleibt eine dringende Aufgabe einen Tag ohne Verantwortlichen, erhalten die Administratoren eine Benachrichtigung; bleibt eine Frage 5 Tage unbeantwortet, erhalten die darin Erwähnten eine Erinnerung; wird eine Aufgabe ohne Fälligkeit bestätigt, fragt die App sofort danach. Die Tage sind wählbar; ohne Server kommt jede Erinnerung nur einmal.
- Was sich geändert hat: Man wählt zwei Zeitpunkte (die täglichen Sicherungen oder jetzt) und sieht, was hinzugefügt, erledigt, wieder geöffnet, in den Papierkorb gelegt oder gelöscht wurde, verschobene Fälligkeiten „von → bis“, an andere übergebene Aufgaben und neue, umbenannte oder gelöschte Projekte. Ein Klick öffnet die Aufgabe.
- Das Projekt fragen (mit lokaler KI): Fragen wie „Was haben wir zur Authentifizierung entschieden?“ oder „Welche Voraussetzungen braucht das Backend?“. Die Antwort stammt nur aus Aufgaben, Kommentaren, Fragen und Entscheidungen, dem Architekturdokument, den Stack-Notizen und Text- oder PDF-Anhängen und nennt ihre Quellen, die sich mit einem Klick öffnen. Nichts verlässt den PC.
- Das Aufgabendetail behält die Felder, die gerade bearbeitet werden, und übernimmt die Änderungen der anderen.
- Bei geöffnetem Aufgabenbereich zeigen die Schaltflächen oben im Projekt nur ihr Symbol: Der Projektname bleibt lesbar.
- Feedback senden (Workspace-Menü, Befehlspalette, Startbildschirm, Einstellungen): ein Problem melden, eine Idee vorschlagen oder eine Frage auf GitHub stellen, mit bereits ausgefüllter Version, oder dem Autor eine E-Mail schreiben.
- Hinweis auf neue Version: Einmal am Tag prüft die App die neueste veröffentlichte Version und zeigt, falls es eine neuere gibt, oben im Fenster „Neuerungen“ und „Herunterladen“. Man kann von Hand prüfen oder es unter Einstellungen › Allgemein ausschalten.
- Todo Doto unterstützen (Workspace-Menü und Startbildschirm): Spende mit PayPal oder PayPal-Adresse zum Kopieren.

## 0.6.0 — 20. Oktober 2026

- Abhängigkeiten: Eine Aufgabe „kommt nach“ anderen. Solange diese nicht erledigt sind, trägt sie ein Schloss; ist sie vor dem fällig, was sie blockiert, weist eine Warnung darauf hin. Im Gantt verbinden Pfeile die Balken und die kritische Kette ist hervorgehoben. Wird die Aufgabe frei, erhält ihr Verantwortlicher eine Benachrichtigung.
- Meilensteine: Versionen oder Releases mit Zieldatum, Fortschritt, Filter und Linie im Gantt; in der Schnelleingabe „~v1.3“. Ist der Meilenstein erreicht, werden die Versionshinweise aus den erledigten Aufgaben geschrieben und kopiert oder an das CHANGELOG.md des Projekts angehängt.
- Auslastung pro Woche (Analyse): Fälligkeiten und geschätzte Stunden jeder Person in den kommenden Wochen, über alle Projekte, mit Überschneidungen und „Übergeben an…“ mit Empfehlungen. Schätzung in Stunden in der Aufgabe oder mit „=3h“.
- Abwesenheiten und Wochenstunden (Mitglieder › Verfügbarkeit): sichtbar in der Liste der Zuständigen, sie verringern die Auslastung und markieren Aufgaben, die fällig werden, während ihr Verantwortlicher abwesend ist.
- Projektgesundheit: ein gelber oder roter Ring in der Seitenleiste, mit den Gründen, und der Verlauf Woche für Woche in der Analyse.
- Bereite PCs: in der Analyse die Matrix Projekte × Personen mit dem Status jedes PCs; in der Liste der Zuständigen, ob der PC der Person für das Projekt bereit ist.
- Interner Statusbericht für einen Zeitraum: Erledigtes, Verzögerungen, nächste Fälligkeiten, Meilensteine, Entscheidungen, Fragen und Warnungen. Er lässt sich als Markdown kopieren, als druckbare Seite für PDF speichern oder per E-Mail senden; die Einleitung kann die lokale KI schreiben.
- Übergabenotiz: Beim Übergeben einer Aufgabe an jemand anderen schlägt das Detail eine Zusammenfassung für die Empfängerin oder den Empfänger vor, als Kommentar hinzuzufügen.
- Fälligkeitskalender (.ics) im Datenordner, für dich und für jedes Projekt, zum Öffnen in Outlook oder Thunderbird; sie werden im Workspace-Menü eingeschaltet.
- Checklisten in Aufgaben und wöchentliche oder monatliche Wiederholung: Beim Erledigen entsteht die nächste, mit der Liste zum erneuten Abarbeiten.
- Projektvorlagen: Man speichert ein Projekt als Vorlage und erstellt daraus ein neues mit Stack, Anhangordnern, Meilensteinen und Aufgaben, mit Daten ab heute.
- Geführte Aufräumhilfe für Administratoren: nie verwendete Labels, leere Ordner, ruhende Projekte, verschwundene Anhänge, abzuschließende Meilensteine und alte Papierkörbe.

## 0.5.0 — 20. Oktober 2026

- Schnelleingabe: Über der Liste schreibt man „CSV-Export !hoch @mario #bug bis Freitag“ und Enter erstellt die Aufgabe mit Priorität, Zuständigem, Label und Fälligkeit. Was erkannt wird, ist vorher sichtbar; das X lässt es im Titel. Das funktioniert auch im Dialog „Neue Aufgabe“.
- Heute: eine Seite mit dem, was dich in allen Projekten betrifft (überfällig, heute und diese Woche fällig, dringend, Fragen, die auf deine Antwort warten, Antworten auf deine Fragen). Erledigen und verschieben, ohne das Projekt zu öffnen; das Verschieben gilt nur für dich und ändert die Fälligkeit nicht.
- Entscheidungen: In einer Frage wird die gewählte Antwort zu „der Entscheidung“, mit Begründung. Das Projekt hat sein Entscheidungsprotokoll, mit Suche und Kopie als Markdown.
- Warnungen und Durchlaufzeiten: im Projekt die Liste dessen, was schiefläuft, ohne dass es jemand gemeldet hat (Verzögerungen, dringende Aufgaben ohne Zuständigen, unbeantwortete Fragen, stockende Aufgaben), und die mittleren Zeiten von erstellt bis bestätigt und bis erledigt, mit dem Alter der offenen Aufgaben.
- Git pro Aufgabe: im Detail die Commits, die TODO-n nennen, und der Branch-Name zum Kopieren; die Aufgabe gilt als „in Arbeit“ bei neuen Commits oder wenn ihr Branch auf dem PC ausgecheckt ist.
- Archiv: Seit mehr als 90 Tagen erledigte Aufgaben stehen unten in „Erledigt“, hinter „Archivierte anzeigen“. Die Suche findet sie immer.
- Befehlspalette: In Strg+K zeigt „>“ die Befehle (Heute, neue Aufgabe, Entscheidungen, Warnungen, Projektbereiche, Einstellungen…) und „+“ fügt dem geöffneten Projekt eine Aufgabe hinzu.

## 0.4.0 — 20. Oktober 2026

- Büro-VPN aus den Einstellungen: Man wählt ein in Windows eingerichtetes VPN, und Todo Doto verbindet es selbst, wenn der freigegebene Ordner nicht antwortet (auch beim Start). Die Zugangsdaten bleiben bei Windows.
- Firmenanmeldung: Mit dem Domänenkonto (Active Directory oder Microsoft Entra ID) ist dieselbe Person auf jedem PC derselbe Benutzer; Rollen können aus Active-Directory-Gruppen abgeleitet werden.
- E-Mail und Teams: „Per E-Mail senden“ bei Aufgaben, Roadmap und Übersicht; ein Microsoft-Teams-Kanal pro Projekt mit erstellten und erledigten Aufgaben, Zuweisungen, Fragen und Erwähnungen; E-Mail an alle, die erwähnt werden oder eine Aufgabe erhalten; der Tagesüberblick jeden Morgen. Versand mit dem Outlook des PCs oder dem SMTP-Server des Unternehmens; alles optional und vom Administrator gewählt.
- Für größere Teams gemacht: Verlauf in Dateien pro Monat und pro PC (keine einzelne, von allen neu geschriebene Datei mehr), ein Änderungsjournal, um zu wissen, welche Dateien neu zu lesen sind, seltenere Ordnerprüfung, wenn das Fenster im Hintergrund ist oder man nicht am PC ist, Projekte mit Hunderten Aufgaben in Kapitel aufgeteilt.

## 0.3.0 — 20. Oktober 2026

- Todo Doto ist kostenlos: Lizenzen und Abonnements sind ausgesetzt. Wer möchte, kann die Entwicklung mit einer PayPal-Spende unterstützen (Einstellungen › Allgemein und Website).
- Wer arbeitet woran: im Aufgabendetail „Ich arbeite daran“; in der Liste ein grünes Kennzeichen mit der Person, ohne die Spalten zu verschieben; in der neuen Übersicht die Liste des ganzen Teams.
- Roadmap für den Kunden: eine Seite mit dem, was fertig ist und was kommt, ohne Beschreibungen, Kommentare oder interne Details, zum Versenden oder Drucken als PDF.
- Diesen PC einrichten: in einem Schritt die Programme, die alle deine Projekte brauchen, jedes nur einmal installiert.
- Veralteter Stack: Ändern sich die Projektdateien (z. B. eine neue Node.js-Version), schlägt ein Hinweis vor, den Stack mit einem Klick zu aktualisieren.
- Laptop außerhalb des Büros: Ohne den freigegebenen Ordner arbeitet man auf der Kopie des PCs weiter; zurück im Büro werden die Änderungen mit denen der Kollegen zusammengeführt, Feld für Feld, und Konflikte angezeigt.
- Verschlüsselung der Daten auf der Festplatte für Netzwerk-Workspaces (Einstellungen › Benutzerdaten, Administratoren): Dateien, Sicherungen und die Kopie für unterwegs sind ohne Passwort unlesbar.
- Leichtere Änderungserkennung in Netzwerkordnern: Es werden nur geänderte Ordner abgefragt.

## 0.2.26 — 16. Oktober 2026

- Lokale KI, kostenlos und vollständig auf dem PC (Ollama mit Qwen 3 4B oder ein OpenAI-kompatibler Server wie LM Studio): Die App spricht nur mit der auf dem PC installierten Engine, nie mit externen Diensten.
- Einstellungen › Lokale KI: Verbindungstest und Download der Modelle mit Fortschrittsbalken. Im Windows-Installer eine optionale Auswahl, auch die KI zu installieren.
- Stack: „Aus den Projektdateien erkennen“ mit aktiver KI schlägt auch Voraussetzungen, Schritte, Variablen und Notizen vor, die die Dateien nicht ausdrücklich nennen, zur Auswahl vor dem Hinzufügen.
- Unterstützte Funktionen: „So beheben“ für Voraussetzungen, Aufgaben aus einem Text, Hinweis auf ähnliche Aufgaben, Suche nach Bedeutung, Commits, die eine Aufgabe erledigen könnten, Wochenzusammenfassung, AGENTS.md/CLAUDE.md aus dem Stack.
- Ein Banner oben lädt ein, die lokale KI einzuschalten; einmal geschlossen, erscheint es nicht wieder.

## 0.2.25 — 16. Oktober 2026

- In der Seitenleiste stehen die Projektbereiche jetzt in der Reihenfolge Stack, Todo, Gantt, Anhänge.
- Neue Website: Preise der Pläne Free, Team und Business, häufige Fragen, Benutzerhandbuch, Versionshinweise, Vergleiche mit Trello und Excel, aktualisierte rechtliche Seiten.

## 0.2.24 — 15. Oktober 2026

- Stack: Ungültige Felder verhindern das Speichern.

## 0.2.23 — 15. Oktober 2026

- „Aus den Projektdateien erkennen“ nur mit einem gültigen Projektordner.

## 0.2.22 — 15. Oktober 2026

- Der letzte Workspace öffnet sich wieder, ohne über die Workspace-Auswahl zu gehen.

## 0.2.21 — 15. Oktober 2026

- Projektordner nur angezeigt, wenn er auf diesem PC wirklich existiert.

## 0.2.20 — 15. Oktober 2026

- Gantt-Filter, nicht gesetzte Fälligkeit, Einstellungen mit „Benutzerdaten“.

## 0.2.19 — 15. Oktober 2026

- Projektordner auf diesem PC, Einstellungen in Registerkarten.

## 0.2.18 — 15. Oktober 2026

- Todo Doto: neuer Name, Gantt der bestätigten Aufgaben, Voraussetzungen aus den Projektdateien.

## 0.2.17 — 15. Oktober 2026

- Git-Commit → Aufgabe: „schließt TODO-n“ erledigt die Aufgabe.

## 0.2.16 — 15. Oktober 2026

- Gemeinsame PC-Konfiguration, einstellbare Benachrichtigungen, Sicherungen.

## 0.2.15 — 15. Oktober 2026

- Löschungen auf den Datenordner beschränkt, Meldungen zu den Projektdateien.

## 0.2.14 — 14. Oktober 2026

- Wahlweise „Passwort merken“, verschlüsselt mit Windows DPAPI.

## 0.2.13 — 14. Oktober 2026

- Favoriten in der Seitenleiste nur, wenn es Projekte mit Stern gibt.

## 0.2.12 — 14. Oktober 2026

- Externe Links, Prüfung von .NET und Voraussetzungen außerhalb des PATH, Aufgabenfelder im Detail.

## 0.2.11 — 14. Oktober 2026

- Projekte aus ihrem Ordner, Stack auch aus Netzwerkordnern und Unterordnern, schnelleres Netzwerk.

## 0.2.10 — 14. Oktober 2026

- Projektsichtbarkeit öffentlich oder eingeschränkt, mit Punkt in der Seitenleiste.

## 0.2.9 — 14. Oktober 2026

- Netzwerkordner mit erklärten Fehlern, Ordner mit dem Projekt erstellt, Stack-Import.

## 0.2.8 — 14. Oktober 2026

- Projektordner für Workspaces abgeleitet, die vor 0.2.4 erstellt wurden.

## 0.2.7 — 14. Oktober 2026

- Projektname aus seinem Ordner, ohne spätere Änderung.

## 0.2.6 — 14. Oktober 2026

- Berechtigungsverwaltung auf der Mitgliederseite, Korrektur der Aktualisierung im Hintergrund.

## 0.2.5 — 14. Oktober 2026

- GitHub, automatische Prüfung der Voraussetzungen, Name und Benutzer des Projekts.

## 0.2.4 — 14. Oktober 2026

- Getrennter Projektordner und Datenordner, automatische Einrichtung.

## 0.2.3 — 14. Oktober 2026

- Workspace aus einem Ordner bestehender Projekte, mit automatisch erstellten Projekten.

## 0.2.2 — 14. Oktober 2026

- Projektbereiche in der Seitenleiste, Stack mit .md-Import und automatischen Voraussetzungen.

## 0.2.1 — 14. Oktober 2026

- Speichern unter Sperre zwischen PCs, portable exe ohne Installer.

## 0.2.0 — 14. Oktober 2026

- Erste veröffentlichte Version mit automatischem Build, Website und Installern auf Italienisch und Englisch.
