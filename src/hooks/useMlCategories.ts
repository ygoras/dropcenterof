import { useState, useCallback } from "react";
import { api } from "@/lib/apiClient";

export interface MlCategory {
  id: string;
  name: string;
  path?: string;
}

export interface MlAttribute {
  id: string;
  name: string;
  type: string; // string, number, list, boolean
  required: boolean;
  tooltip: string | null;
  values: Array<{ id: string; name: string }>;
  default_value: string | null;
  allowed_units: Array<{ id: string; name: string }>;
}

interface CategorySearchResponse {
  categories: MlCategory[];
}

interface AttributesResponse {
  attributes: MlAttribute[];
  category?: MlCategory;
}

export function useMlCategories() {
  const [categories, setCategories] = useState<MlCategory[]>([]);
  const [attributes, setAttributes] = useState<MlAttribute[]>([]);
  const [searchingCategories, setSearchingCategories] = useState(false);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MlCategory | null>(null);

  const searchCategories = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setCategories([]);
      return;
    }

    setSearchingCategories(true);
    try {
      const result = await api.get<CategorySearchResponse>(
        `/api/ml/categories?action=search&q=${encodeURIComponent(query)}`
      );
      if (result?.categories) {
        setCategories(result.categories);
      }
    } catch (err) {
      console.error("Error searching categories:", err);
    } finally {
      setSearchingCategories(false);
    }
  }, []);

  const fetchAttributes = useCallback(async (categoryId: string) => {
    setLoadingAttributes(true);
    setAttributes([]);
    try {
      const result = await api.get<AttributesResponse>(
        `/api/ml/categories?action=attributes&category_id=${encodeURIComponent(categoryId)}`
      );
      if (result?.attributes) {
        setAttributes(result.attributes);
      }
      if (result?.category) {
        setSelectedCategory(result.category);
      }
    } catch (err) {
      console.error("Error fetching attributes:", err);
    } finally {
      setLoadingAttributes(false);
    }
  }, []);

  const selectCategory = useCallback(
    (category: MlCategory) => {
      setSelectedCategory(category);
      fetchAttributes(category.id);
    },
    [fetchAttributes]
  );

  const clearCategory = useCallback(() => {
    setSelectedCategory(null);
    setAttributes([]);
    setCategories([]);
  }, []);

  return {
    categories,
    attributes,
    selectedCategory,
    searchingCategories,
    loadingAttributes,
    searchCategories,
    selectCategory,
    clearCategory,
    fetchAttributes,
  };
}
