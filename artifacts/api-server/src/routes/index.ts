import { Router, type IRouter } from "express";
import academicTranscriptsRouter from "./academic-transcripts";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(academicTranscriptsRouter);

export default router;
