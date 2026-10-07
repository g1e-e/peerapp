// The peer review form.
//
// Edit this list to add, remove, or reword questions.
// Each segment is one section on the page. It has a title and its own questions.
//
// Every question needs:
//   id    — unique across the whole form (answers are saved under this id)
//   label — the words shown next to the field
//   type  — "text", "textarea", "date", "select", "rating", or "yesNoNa"
//
// A select question also needs options, for example:
//   options: ["Open", "In Progress", "Completed"]
//
// A rating question is 1 to 5. Add min and max to use a different scale.
//
// A yesNoNa question shows three radio buttons on one row: Yes, No, and N/A.
// The reviewer can pick only one. The choice is saved like any other answer.
//
// Optional:
//   placeholder — gray hint text inside a text or textarea field
//   note        — on a segment, a short line under the section title
//   number      — shown in front of the label, like "1. "

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

  {
    title: "Chart Review",
    questions: [
      {
        id: "chartSettingAppropriate",
        number: 1,
        label: "Setting appropriate for procedure performed?",
        type: "yesNoNa",
      },
      {
        id: "chartPreOpAssessment",
        number: 2,
        label: "Pre-op H&P assessment complete and adequate (review of systems, necessary lab present, clinical indications for procedure)?",
        type: "yesNoNa",
      },
      {
        id: "chartProcedureTime",
        number: 3,
        label: "Length of time in procedure was appropriate?",
        type: "yesNoNa",
      },
      {
        id: "chartManagementAppropriate",
        number: 4,
        label: "Medical/Surgical management was appropriate?",
        type: "yesNoNa",
      },
      {
        id: "chartOperativeReport",
        number: 5,
        label: "Operative report gives complete description of procedure performed and dictates in timely manner?",
        type: "yesNoNa",
      },
      {
        id: "chartPathologyConsistent",
        number: 6,
        label: "Pathology report consistent with procedure?",
        type: "yesNoNa",
      },
      {
        id: "chartInformedConsent",
        number: 7,
        label: "Physician informed consent present?",
        type: "yesNoNa",
      },
      {
        id: "chartComplicationDocumentation",
        number: 8,
        label: "If complication or problem noted, medical record documentation complete?",
        type: "yesNoNa",
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
