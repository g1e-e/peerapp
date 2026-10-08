export const basicDetailsSegment = {
  title: "Basic Details",
  questions: [
    {
      id: "mrn",
      label: "MRN #",
      type: "text",
      placeholder: "Medical record number",
      width: "half",
    },
    {
      id: "date",
      label: "Date",
      type: "date",
      width: "half",
    },
    {
      id: "status",
      label: "Status",
      type: "select",
      options: ["Open", "Closed"],
      width: "half",
    },
    {
      id: "reviewer",
      label: "Reviewer",
      type: "text",
      width: "half",
    },
    {
      id: "providerName",
      label: "Provider Name",
      type: "text",
      width: "half",
    },
    {
      id: "procedurePerformed",
      label: "Procedure Performed",
      type: "text",
      width: "half",
    },
    {
      id: "incidentNumber",
      label: "Incident Number",
      type: "text",
    },
  ],
};

export function emptyBasicDetails() {
  const details = {};
  for (const question of basicDetailsSegment.questions) details[question.id] = "";
  return details;
}

export const segments = [
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
];

export const incidentTemplate = {
  questions: [
    {
      id: "patientName",
      label: "Patient name",
      type: "text",
      width: "half",
    },
    {
      id: "mrn",
      label: "MRN",
      type: "text",
      width: "half",
    },
    {
      id: "surgeryDate",
      label: "Date of Surgery",
      type: "date",
      width: "half",
    },
    {
      id: "incidentNumber",
      label: "Incident #",
      type: "text",
      width: "half",
    },
    {
      id: "surgeon",
      label: "Surgeon",
      type: "text",
      width: "half",
    },
    {
      id: "procedure",
      label: "Procedure",
      type: "textarea",
      rows: 2,
    },
    {
      id: "eventReview",
      label: "Event/Routine review",
      type: "textarea",
      rows: 5,
    },
    {
      id: "reviewedBy",
      label: "Reviewed by",
      type: "text",
      width: "half",
    },
    {
      id: "reviewDate",
      label: "Date",
      type: "date",
      width: "half",
    },
  ],
};

export const MAX_INCIDENTS = 10;

export function incidentSegment(number) {
  return {
    title: `Peer Review - Incident ${number}`,
    questions: incidentTemplate.questions.map((question) => ({
      ...question,
      id: `incident${number}.${question.id}`,
    })),
  };
}

export function buildSegments(incidentCount) {
  const count = clampIncidentCount(incidentCount);
  const incidents = [];
  for (let number = 1; number <= count; number += 1) {
    incidents.push(incidentSegment(number));
  }
  return segments.concat(incidents);
}

export function clampIncidentCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_INCIDENTS, Math.max(0, Math.floor(number)));
}
