import { Router, type IRouter } from "express";
import academicTranscriptsRouter from "./academic-transcripts";
import academicMappingsRouter from "./academic-mappings";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(academicTranscriptsRouter);
router.use(academicMappingsRouter);

export default router;
