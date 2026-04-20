// testParser.mjs  — run with: node testParser.mjs
import { parseIntent } from "./src/nlp/intentParser.js";
import { matchField }  from "./src/nlp/fieldMatcher.js";

// Mimic the fields from dummy.xlsx as visual.ts would build them
const fields = [
  { queryName: "Table.Department",      displayName: "Department",      category: "category", type: "text" },
  { queryName: "Table.Year_Semester",   displayName: "Year_Semester",   category: "category", type: "text" },
  { queryName: "Table.Instructor_Name", displayName: "Instructor_Name", category: "category", type: "text" },
  { queryName: "Table.GPA",             displayName: "GPA",             category: "measure",  type: "numeric" },
  { queryName: "Table.Enrollment",      displayName: "Enrollment",      category: "measure",  type: "numeric" },
  { queryName: "Table.Response Rate %", displayName: "Response Rate %", category: "measure",  type: "numeric" },
  { queryName: "Table.FF_Instructors_overall_teaching_effectiveness",
    displayName: "FF_Instructors_overall_teaching_effectiveness",        category: "measure",  type: "numeric" },
];

const queries = [
  { q: "What's the distribution of GPA?",                   expect: { chart: "histogram", value: "GPA" } },
  { q: "Show enrollment by department",                      expect: { chart: "bar",       x: "Department", y: "Enrollment" } },
  { q: "Trend of response rate over semesters",              expect: { chart: "line",      x: "Year_Semester", y: "Response Rate %" } },
  { q: "Distribution of overall teaching effectiveness",     expect: { chart: "histogram", value: "FF_Instructors_overall_teaching_effectiveness" } },
  { q: "Plot the moon phase by instructor",                  expect: { chart: "bar",       x: "Instructor_Name", y: null } },
];

let pass = 0, fail = 0;
for (const { q, expect } of queries) {
  const intent = parseIntent(q, fields);
  const ok =
    intent.chartType === expect.chart &&
    (expect.x     ? intent.xField?.displayName     === expect.x     : true) &&
    (expect.y     ? intent.yField?.displayName      === expect.y     : true) &&
    (expect.value ? intent.valueField?.displayName  === expect.value : true) &&
    (expect.y === null ? intent.yField == null : true);

  console.log(`${ok ? "✅" : "❌"} "${q}"`);
  if (!ok) {
    console.log("   Expected:", expect);
    console.log("   Got:     ", {
      chart: intent.chartType,
      x: intent.xField?.displayName,
      y: intent.yField?.displayName,
      value: intent.valueField?.displayName,
    });
    fail++;
  } else { pass++; }
}
console.log(`\n${pass} passed, ${fail} failed`);