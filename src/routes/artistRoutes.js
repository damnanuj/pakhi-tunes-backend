import { Router } from 'express';
import { getTopArtists } from '../controllers/artistController.js';

const router = Router();

router.get('/', getTopArtists);

export default router;
