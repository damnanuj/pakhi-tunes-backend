import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getAdminDashboard } from '../services/dashboardService.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await getAdminDashboard(req.query.range);
  success(res, data);
});
