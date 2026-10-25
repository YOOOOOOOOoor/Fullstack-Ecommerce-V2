import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useState, useEffect } from "react";
import API from "../../../../API/api.js";
import { Switch } from "@/components/ui/switch";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { toSelectItems } from "@/lib/selectOptions.js";

const Edit = () => {
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);

  const [category, setCategory] = useState([]);

  const [loading, setLoading] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);

  const [, setDeleteLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    stock: "",
    color: "#000000",
    status: "draft",
    category_id: "",
    image: null,
    featured: false,
  });

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const res = await API.get("/category");

        const data = res.data.map((c) => ({
          id: c.id,
          name: c.name,
        }));

        setCategory(data);
      } catch (error) {
        toast.error(
          error.response?.data?.message || "Failed to load categories.",
        );
      }
    };

    fetchCategory();
  }, []);

  const { id } = useParams();

  useEffect(() => {
    const alreadyProduct = async () => {
      try {
        setPageLoading(true);
        const res = await API.get(`/products/${id}`);

        setForm({
          id: res.data.id,
          title: res.data.title,
          description: res.data.description,
          price: res.data.price,
          color: res.data.color,
          stock: res.data.stock,
          category_id: String(res.data.category_id),
          status: res.data.status,
          image_url: res.data.image_url,
          created_at: res.data.created_at,
          featured: res.data.featured,
        });
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load product.");
      } finally {
        setPageLoading(false);
      }
    };

    alreadyProduct();
  }, [id]);

  const addProduct = async () => {
    try {
      setLoading(true);

      const data = new FormData();

      data.append("title", form.title);
      data.append("description", form.description);
      data.append("price", form.price);
      data.append("stock", form.stock);
      data.append("color", form.color);
      data.append("status", form.status);
      data.append("category_id", form.category_id);
      data.append("image", form.image);
      data.append("featured", form.featured);

      const res = await API.put(`/products/${id}`, data);

      toast.success(res.data.message || "Product updated successfully.");

      navigate("/admin/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update product.");
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async () => {
    try {
      setDeleteLoading(true);

      await API.delete(`/products/${id}`);

      toast.success("Product deleted successfully.");

      navigate("/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete product.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      setPreview(null);

      return;
    }

    setPreview(URL.createObjectURL(file));

    setForm({
      ...form,
      image: file,
    });
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div className="space-y-3">
              <Skeleton className="h-10 w-56" />
              <Skeleton className="h-5 w-96" />
            </div>

            {/* Details */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
              <Skeleton className="h-7 w-44" />

              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-11 w-full" />
              </div>

              <div className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-32 w-full" />
              </div>
            </div>

            {/* Image */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-5 w-80" />
              <Skeleton className="h-48 w-48 rounded-xl" />
            </div>
          </div>

          {/* Right */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-11 flex-1" />
                <Skeleton className="h-11 flex-1" />
              </div>

              <Skeleton className="h-11 w-full" />
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>

              <div className="flex justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            </div>

            {/* Inventory */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
              <Skeleton className="h-6 w-32" />

              <div>
                <Skeleton className="h-5 w-20 mb-2" />
                <Skeleton className="h-11 w-full" />
              </div>

              <div>
                <Skeleton className="h-5 w-20 mb-2" />
                <Skeleton className="h-11 w-full" />
              </div>
            </div>

            {/* Options */}
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
              <Skeleton className="h-6 w-40" />

              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-11 w-full" />

              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-12 w-20" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <Spinner className="size-6" />
        </div>
      )}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Section */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Product</h1>

            <p className="text-gray-500 mt-2">
              Update your product details, inventory, and publishing status.
            </p>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="text-xl font-semibold mb-5">
                  Product Details
                </FieldLegend>

                <FieldGroup className="space-y-6">
                  <Field>
                    <FieldLabel>Product Title</FieldLabel>

                    <Input
                      placeholder="Premium wireless mouse"
                      value={form.title}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          title: e.target.value,
                        })
                      }
                      className="h-11"
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Description</FieldLabel>

                    <Textarea
                      placeholder="Tell your customers what they can expect from this product."
                      value={form.description}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          description: e.target.value,
                        })
                      }
                      className="min-h-32 resize-none"
                      required
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>

          {/* Image Card */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <Field>
              <FieldLabel>Product Image</FieldLabel>

              <Input
                type="file"
                accept="image/*"
                onChange={handleChange}
                className="cursor-pointer"
              />

              <FieldDescription>
                Upload a new image if you want to replace the current one.
              </FieldDescription>
            </Field>

            {(preview || form.image_url) && (
              <div className="mt-5">
                <img
                  src={preview || form.image_url}
                  alt={form.title}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const ratio = img.naturalWidth / img.naturalHeight;

                    if (ratio < 0.8) {
                      img.className =
                        "h-48 w-48 rounded-xl object-contain border bg-muted";
                    } else {
                      img.className =
                        "h-48 w-48 rounded-xl object-cover border";
                    }
                  }}
                  className="
        h-48
        w-48
        rounded-xl
        object-cover
        border
      "
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
            <div className="flex gap-3">
              <Button onClick={addProduct} className="flex-1 h-11">
                Save Edit
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/admin/products")}
                className="flex-1 h-11"
              >
                Go Back
              </Button>
            </div>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" className="w-full h-11">
                    Delete Product
                  </Button>
                }
              />

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>

                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    this product from your store.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>

                  <AlertDialogAction onClick={deleteProduct}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Status */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="publish">Product Status</Label>

              <div className="flex items-center gap-3">
                <Switch
                  id="publish"
                  checked={form.status === "published"}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      status: checked ? "published" : "draft",
                    })
                  }
                />

                <span className="text-sm text-gray-600 w-20">
                  {form.status === "published" ? "Published" : "Draft"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-5">
              <Label htmlFor="featured">Featured?</Label>

              <div className="flex items-center gap-3">
                <Switch
                  id="featured"
                  checked={form.featured}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      featured: checked,
                    })
                  }
                />

                <span className="text-sm text-gray-600 w-20">
                  {form.featured ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
            <h2 className="text-lg font-semibold">Inventory</h2>

            <div>
              <Label>Price</Label>

              <Input
                placeholder="120"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price: e.target.value,
                  })
                }
                className="mt-2 h-11"
                required
              />
            </div>

            <div>
              <Label>Stock</Label>

              <Input
                placeholder="50"
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stock: e.target.value,
                  })
                }
                className="mt-2 h-11"
                required
              />
            </div>
          </div>

          {/* Category + Color */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
            <h2 className="text-lg font-semibold">Product Options</h2>

            <div>
              <Label>Category</Label>

              <Select
                value={form.category_id}
                items={toSelectItems(category.map((c) => ({ value: c.id, label: c.name })))}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    category_id: value,
                  })
                }
              >
                <SelectTrigger className="w-full mt-2 h-11">
                  <SelectValue placeholder="Select a Category" />
                </SelectTrigger>

                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Category</SelectLabel>

                    {category.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Color</Label>

              <Input
                type="color"
                className="mt-2 h-12 w-20 p-1 cursor-pointer"
                value={form.color}
                onChange={(e) =>
                  setForm({
                    ...form,
                    color: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Edit;
