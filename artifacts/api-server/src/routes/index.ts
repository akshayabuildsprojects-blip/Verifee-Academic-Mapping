import { Router, type IRouter } from "express";
import academicTranscriptsRouter from "./academic-transcripts";
import academicContextRouter from "./academic-context";
import institutionStatusRouter from "./institution-status";
import academicMappingsRouter from "./academic-mappings";
import reportProofsRouter from "./report-proofs";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(academicTranscriptsRouter);
router.use(academicContextRouter);
router.use(institutionStatusRouter);
router.use(academicMappingsRouter);
router.use(reportProofsRouter);

export default router;
