import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listProducts } from '$lib/server/repositories/products';

export const GET: RequestHandler = async () => {
  const items = await listProducts();
  return json({ items });
};
