// ---------------------------------------------------------------------
// units — what stands where
// ---------------------------------------------------------------------
// The one dataset that touches plots, and it does so by the book:
// plots!units_plot_id_fkey, never a bare embed — units has had two FK
// paths to plots since 0029.

import type { DatasetDef } from "./types";

const UNITS_SELECT =
  "id, name, code, unit_type, status, project_id, plot_id, created_at, " +
  "projects!units_project_id_fkey(name), plots!units_plot_id_fkey(name)";

const UNITS_OPTIONS_SELECT = "unit_type, status";

export const units: DatasetDef = {
  label: "Units",
  description: "Every villa and plot-holding, with its type and sale status.",
  source: "units",
  select: UNITS_SELECT,
  optionsSelect: UNITS_OPTIONS_SELECT,
  projectField: "project",
  dateFields: [],
  money: false,
  defaultColumns: ["project", "plot", "unit", "unit_type", "status"],
  defaultSort: [{ field: "unit", dir: "asc" }],
  fields: {
    project: {
      label: "Project",
      type: "text",
      path: "projects.name",
      identityPath: "project_id",
      filterColumn: "project_id",
      sortColumn: "projects.name",
      groupable: true,
      aggregates: ["count_distinct"],
      lookup: "projects",
    },
    plot: {
      label: "Plot",
      type: "text",
      path: "plots.name",
      identityPath: "plot_id",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    unit: {
      label: "Unit",
      type: "text",
      path: "name",
      identityPath: "id",
      sortColumn: "name",
      groupable: true,
      aggregates: ["count_distinct"],
    },
    code: {
      label: "Code",
      type: "text",
      path: "code",
      sortColumn: "code",
      groupable: false,
      aggregates: [],
    },
    unit_type: {
      label: "Type",
      type: "text",
      path: "unit_type",
      filterColumn: "unit_type",
      sortColumn: "unit_type",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    status: {
      label: "Status",
      type: "text",
      path: "status",
      filterColumn: "status",
      sortColumn: "status",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
  },
};
