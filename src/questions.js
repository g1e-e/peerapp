// The peer review form.
//
// Edit this list to add, remove, or reword questions.
// Each segment is one section on the page. It has a title and its own questions.
//
// Every question needs:
//   id    — unique across the whole form (answers are saved under this id)
//   label — the words shown next to the field
//   type  — "text", "textarea", "date", "select", "rating", "yesNoNa", or "radio"
//
// A select question also needs options, for example:
//   options: ["Open", "In Progress", "Completed"]
//
// A rating question is 1 to 5. Add min and max to use a different scale.
//
// A yesNoNa question shows three radio buttons on one row: Yes, No, and N/A.
// A radio question is that same row, but you choose the labels:
//   options: ["Difficult", "Average"]
// The reviewer can pick only one. The choice is saved like any other answer.
//
// Optional:
//   placeholder — gray hint text inside a text or textarea field
//   note        — on a segment, a short line under the section title
//   number      — shown in front of the label, like "1. "
//   rows        — for a textarea, how many lines tall it starts (default 4)
//   width       — "half" sits the field in a two-column row when the section
//                 is wide (Patient name beside MRN, for example). Leave it off
//                 for a full-width field. A narrow section stacks every field.

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

  {
    title: "Opportunity for Improvement",
    questions: [
      {
        id: "opportunityComplexity",
        number: 1,
        label: "Was this case more complex than average?",
        type: "radio",
        options: ["Difficult", "Average"],
      },
      {
        id: "opportunityDocumentation",
        number: 2,
        label: "Do you consider there to be a documentation issue? If yes, recommend in comments whether there should be further trending, continued investigation per bylaws, or if outside review is required",
        type: "radio",
        options: ["Yes", "No", "N/A"],
      },
      {
        id: "opportunityQualityOfCare",
        number: 3,
        label: "Do you consider there to be a quality of care issue? If yes, recommend in comments whether there should be further trending, continued investigation per bylaws, or if outside review is required.",
        type: "radio",
        options: ["Yes", "No", "N/A"],
      },
    ],
  },

  {
    title: "Comments",
    questions: [
      {
        id: "comments",
        label: "Comments",
        type: "textarea",
        rows: 12,
      },
    ],
  },

  // Same fields as Incident 2. Ids start with incident1 so the answers stay separate.
  {
    title: "Peer Review - Incident 1",
    questions: [
      {
        id: "incident1PatientName",
        label: "Patient name",
        type: "text",
        width: "half",
      },
      {
        id: "incident1Mrn",
        label: "MRN",
        type: "text",
        width: "half",
      },
      {
        id: "incident1SurgeryDate",
        label: "Date of Surgery",
        type: "date",
        width: "half",
      },
      {
        id: "incident1Number",
        label: "Incident #",
        type: "text",
        width: "half",
      },
      {
        id: "incident1Surgeon",
        label: "Surgeon",
        type: "text",
        width: "half",
      },
      {
        id: "incident1Procedure",
        label: "Procedure",
        type: "textarea",
        rows: 2,
      },
      {
        id: "incident1EventReview",
        label: "Event/Routine review",
        type: "textarea",
        rows: 5,
      },
      {
        id: "incident1ReviewedBy",
        label: "Reviewed by",
        type: "text",
        width: "half",
      },
      {
        id: "incident1ReviewDate",
        label: "Date",
        type: "date",
        width: "half",
      },
    ],
  },

  // Same fields as Incident 1. Ids start with incident2 so the answers stay separate.
  {
    title: "Peer Review - Incident 2",
    questions: [
      {
        id: "incident2PatientName",
        label: "Patient name",
        type: "text",
        width: "half",
      },
      {
        id: "incident2Mrn",
        label: "MRN",
        type: "text",
        width: "half",
      },
      {
        id: "incident2SurgeryDate",
        label: "Date of Surgery",
        type: "date",
        width: "half",
      },
      {
        id: "incident2Number",
        label: "Incident #",
        type: "text",
        width: "half",
      },
      {
        id: "incident2Surgeon",
        label: "Surgeon",
        type: "text",
        width: "half",
      },
      {
        id: "incident2Procedure",
        label: "Procedure",
        type: "textarea",
        rows: 2,
      },
      {
        id: "incident2EventReview",
        label: "Event/Routine review",
        type: "textarea",
        rows: 5,
      },
      {
        id: "incident2ReviewedBy",
        label: "Reviewed by",
        type: "text",
        width: "half",
      },
      {
        id: "incident2ReviewDate",
        label: "Date",
        type: "date",
        width: "half",
      },
    ],
  },
];
