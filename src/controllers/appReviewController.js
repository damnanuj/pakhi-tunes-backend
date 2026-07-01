import AppReview from '../models/AppReview.js';
import { AppError } from '../utils/AppError.js';

export const MIN_TEXT_LENGTH = 10;
export const MAX_TEXT_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getSummaryForSlug(slug) {
  const [result] = await AppReview.aggregate([
    { $match: { slug } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  if (!result) {
    return { averageRating: 0, reviewCount: 0 };
  }

  return {
    averageRating: Math.round(result.averageRating * 100) / 100,
    reviewCount: result.reviewCount,
  };
}

export function validateReviewPayload(body, slug) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!name) {
    throw new AppError('name is required', 400);
  }
  if (name.length > 80) {
    throw new AppError('name must be 80 characters or less', 400);
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new AppError('a valid email is required', 400);
  }
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new AppError('rating must be an integer between 1 and 5', 400);
  }
  if (text.length < MIN_TEXT_LENGTH) {
    throw new AppError(`review text must be at least ${MIN_TEXT_LENGTH} characters`, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(`review text must be ${MAX_TEXT_LENGTH} characters or less`, 400);
  }

  return {
    slug,
    name,
    email,
    rating: body.rating,
    text,
  };
}
