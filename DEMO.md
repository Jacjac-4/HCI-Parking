# Prototype demo and usability checks

## Five-minute presentation route

1. **Design goal (30 seconds):** Show the four task cards from the combined sketch.
   Explain the five-step application, clear pending status, connected lot information,
   ticket search beside its field, and prominent parking-help link.
2. **Permit journey (2 minutes):** Enter a name, residence, year, and vehicle of
   your choosing. Choose a matching permit, show Back/Edit, review, and submit.
   Open My Parking and Home to show Under review and the explanation that an
   application does not authorize parking. Optionally demonstrate withdrawing an
   incorrect application.
3. **Where to park (45 seconds):** Select a permit on Home, preview its map, then
   open its covered lots. Explain that the categories, lots, and reference maps
   come from UNH's published information; the app does not redirect to UNH.
4. **Tickets (1 minute):** Add a ticket with information entered during the demo.
   Select it, review the total, and confirm a prototype payment OR submit an
   appeal explanation. Show its updated status and confirmation. No card details,
   real payments, or external submissions are involved.
5. **Help and next steps (45 seconds):** Open Parking help. Explain that this is
   guided help, not a generative AI chatbot. Mention planned usability feedback.

## Before presenting

- Start both servers using README instructions and open localhost:8082.
- Enter all records yourself; no sample records are preloaded.
- Keep the API running during the demo. Restarting it clears records.
- Keep a copy of the screenshots in the Design Sprint 2 evidence folder as backup.
- Use a normal desktop browser if the embedded browser does not expose downloads.
- Have two questions for classmates, such as: “Is Under review clear enough?” and
  “Can you tell which lots your selected permit covers?”

## Part 4 tasks for three non-team participants

These are suggested tasks, not a claim that participant testing has occurred.

- Find a permit matching a residence/year scenario of their choosing, correct a
  vehicle entry before submission, and explain the resulting application status.
- Find the covered lots and map for their chosen permit.
- Add two tickets, find one by its number, select tickets, and explain the total.
- Complete a prototype payment or appeal and locate its confirmation afterward.
- Find help explaining whether an application permits parking.

Record completion, hesitation, errors, and participant comments. Fix small bugs;
record larger ideas as future work. Obtain permission before photographing people.
Include actual observations and screenshots in the individual design document.

## Scope

Single-user Python/NiceGUI prototype with an in-memory FastAPI backend. All task
flows stay within the app. Submitted applications remain under review until
withdrawn; appeals remain pending. No real authentication, approvals, payments,
or ticket verification is claimed. These production systems are outside this
sprint prototype's scope.
