import { Router } from "express";
import {
  getTopArtists,
  getArtistSongs,
} from "../controllers/artistController.js";
import { ensureDbConnection } from "../middlewares/ensureDbConnection.js";

const router = Router();

router.use(ensureDbConnection);

router.get("/", getTopArtists);
router.get("/:artistId/songs", getArtistSongs);
router.get("/:encryptedId", getArtistSongs);
router.get("/:artistSlug/:encryptedId", getArtistSongs);

export default router;
