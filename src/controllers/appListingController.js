import AppListing from '../models/AppListing.js';
import AppReview from '../models/AppReview.js';
import { getSummaryForSlug, validateReviewPayload } from './appReviewController.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

function reviewsPaginationQueryString(limit, offset) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return `?${params.toString()}`;
}

function buildReviewsPagination(req, results, count, limit, offset) {
  const currentPage = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  const totalPages = limit > 0 ? Math.ceil(count / limit) : 1;

  let next = currentPage < totalPages ? currentPage + 1 : null;
  let previous = currentPage > 1 ? currentPage - 1 : null;

  if (req) {
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    next =
      currentPage < totalPages && results.length > 0
        ? `${baseUrl}${reviewsPaginationQueryString(limit, offset + limit)}`
        : null;
    previous =
      currentPage > 1
        ? `${baseUrl}${reviewsPaginationQueryString(limit, Math.max(0, offset - limit))}`
        : null;
  } else if (!results.length) {
    next = null;
  }

  return {
    count,
    currentPage,
    totalPages,
    next,
    previous,
    results,
  };
}

export const getAppDetails = asyncHandler(async (req, res) => {
  const slug = req.params.slug?.trim();
  if (!slug) {
    throw new AppError('slug is required', 400);
  }

  const listing = await AppListing.findOne({ slug });
  if (!listing) {
    throw new AppError('app not found', 404);
  }

  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const filter = { slug };

  const [reviews, count, summary] = await Promise.all([
    AppReview.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    AppReview.countDocuments(filter),
    getSummaryForSlug(slug),
  ]);

  const reviewResults = reviews.map((review) => review.toPublicObject());

  success(res, {
    app: listing.toPublicObject(),
    reviews: {
      summary,
      ...buildReviewsPagination(req, reviewResults, count, limit, offset),
    },
  });
});

export const createReview = asyncHandler(async (req, res) => {
  const slug = req.params.slug?.trim();
  if (!slug) {
    throw new AppError('slug is required', 400);
  }

  const listing = await AppListing.findOne({ slug });
  if (!listing) {
    throw new AppError('app not found', 404);
  }

  const payload = validateReviewPayload(req.body, slug);
  const review = await AppReview.create(payload);
  success(res, review.toPublicObject(), 201);
});

export const incrementDownloadCount = asyncHandler(async (req, res) => {
  const slug = req.params.slug?.trim();
  if (!slug) {
    throw new AppError('slug is required', 400);
  }

  const listing = await AppListing.findOneAndUpdate(
    { slug },
    { $inc: { downloadCount: 1 } },
    { new: true }
  );

  if (!listing) {
    throw new AppError('app not found', 404);
  }

  success(res, { slug: listing.slug, downloadCount: listing.downloadCount });
});
