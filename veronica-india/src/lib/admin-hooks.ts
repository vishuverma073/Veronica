"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { adminApi, type ProductListParams } from "@/lib/admin-api";

/**
 * SWR read hooks for the admin panel. Keys are arrays so different filter
 * combinations cache independently; mutations call the matching `mutate`.
 */

const noRetryOn401: SWRConfiguration = {
  shouldRetryOnError: false,
  revalidateOnFocus: false,
};

export function useProducts(params: ProductListParams = {}) {
  const key = ["admin/products", params.q ?? "", params.status ?? "", params.flag ?? ""];
  return useSWR(key, () => adminApi.listProducts(params), noRetryOn401);
}

export function useProduct(id: number | null) {
  return useSWR(
    id ? ["admin/products", id] : null,
    () => adminApi.getProduct(id as number),
    noRetryOn401,
  );
}

export function useCategories() {
  return useSWR(["admin/categories"], () => adminApi.listCategories(), noRetryOn401);
}

export function useCategoryProducts(categoryId: number | null) {
  return useSWR(
    categoryId != null ? ["admin/products", "categoryTree", categoryId] : null,
    () => adminApi.listProductsForCategoryTree(categoryId as number),
    noRetryOn401,
  );
}

export function useHome() {
  return useSWR(["admin/home"], () => adminApi.getHome(), noRetryOn401);
}

export function useSettings() {
  return useSWR(["admin/settings"], () => adminApi.getSettings(), noRetryOn401);
}
