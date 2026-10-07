// The peer review form.
//
// Edit this list to add, remove, or reword questions.
// Each segment is one section on the page. It has a title and its own questions.
//
// Every question needs:
//   id    — unique across the whole form (answers are saved under this id)
//   label — the words shown next to the field
//   type  — "text", "textarea", "date", "select", or "rating"
//
// A select question also needs options, for example:
//   options: ["Open", "In Progress", "Completed"]
//
// A rating question is 1 to 5. Add min and max to use a different scale.
//
// Optional:
//   placeholder — gray hint text inside a text or textarea field
//   note        — on a segment, a short line under the section title

export const segments = [
  {
    title: "Basic Details",
    questions: [
      {
        id: "mrn",
        label: "MRN #",
        type: "text",
        placeholder: "Medical record number",
      },
      {
        id: "date",
        label: "Date",
        type: "date",
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        // Change this list to edit the dropdown choices.
        options: ["Open", "In Progress", "Completed"],
      },
      {
        id: "reviewer",
        label: "Reviewer",
        type: "text",
      },
      {
        id: "providerName",
        label: "Provider Name",
        type: "text",
      },
      {
        id: "procedurePerformed",
        label: "Procedure Performed",
        type: "text",
      },
      {
        id: "incidentNumber",
        label: "Incident Number",
        type: "text",
      },
    ],
  },

  // PLACEHOLDER — replace these questions when the real ones are decided.
  {
    title: "Chart Review",
    note: "Placeholder questions. Replace them in src/questions.js.",
    questions: [
      {
        id: "chartComplete",
        label: "Was the chart complete?",
        type: "select",
        options: ["Yes", "Partial", "No"],
      },
      {
        id: "chartNotes",
        label: "Chart review notes",
        type: "textarea",
        placeholder: "Placeholder — notes from the chart review",
      },
    ],
  },

  // PLACEHOLDER — replace these questions when the real ones are decided.
  {
    title: "Opportunity for Improvement",
    note: "Placeholder questions. Replace them in src/questions.js.",
    questions: [
      {
        id: "opportunityDescription",
        label: "What is the opportunity?",
        type: "textarea",
        placeholder: "Placeholder — describe the opportunity for improvement",
      },
      {
        id: "opportunityAction",
        label: "Suggested next step",
        type: "textarea",
        placeholder: "Placeholder — what should happen next?",
      },
    ],
  },

  // PLACEHOLDER — replace these questions when the real ones are decided.
  {
    title: "Comments",
    note: "Placeholder questions. Replace them in src/questions.js.",
    questions: [
      {
        id: "comments",
        label: "Comments",
        type: "textarea",
        placeholder: "Placeholder — overall comments",
      },
      {
        id: "additionalComments",
        label: "Additional notes",
        type: "textarea",
        placeholder: "Placeholder — anything else to record",
      },
    ],
  },

  // PLACEHOLDER — same starter questions as Incident 2, with different ids
  // so the two incidents keep separate answers. Edit this list on its own.
  {
    title: "Peer Review - Incident 1",
    note: "Placeholder questions. Replace them in src/questions.js.",
    questions: [
      {
        id: "incident1Date",
        label: "Incident date",
        type: "date",
      },
      {
        id: "incident1Description",
        label: "Description",
        type: "textarea",
        placeholder: "Placeholder — what happened in this incident?",
      },
      {
        id: "incident1Rating",
        label: "Rating",
        type: "rating",
      },
      {
        id: "incident1Notes",
        label: "Notes",
        type: "textarea",
        placeholder: "Placeholder — notes about this incident",
      },
    ],
  },

  // PLACEHOLDER — same starter questions as Incident 1, with different ids.
  {
    title: "Peer Review - Incident 2",
    note: "Placeholder questions. Replace them in src/questions.js.",
    questions: [
      {
        id: "incident2Date",
        label: "Incident date",
        type: "date",
      },
      {
        id: "incident2Description",
        label: "Description",
        type: "textarea",
        placeholder: "Placeholder — what happened in this incident?",
      },
      {
        id: "incident2Rating",
        label: "Rating",
        type: "rating",
      },
      {
        id: "incident2Notes",
        label: "Notes",
        type: "textarea",
        placeholder: "Placeholder — notes about this incident",
      },
    ],
  },
];
