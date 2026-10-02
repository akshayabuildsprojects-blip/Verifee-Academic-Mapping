import georgiaTechDataset from "./georgia-tech-programs.json";

export { georgiaTechDataset };
export type GeorgiaTechProgram = (typeof georgiaTechDataset.programs)[number];