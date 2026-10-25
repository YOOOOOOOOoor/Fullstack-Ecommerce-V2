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
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { toSelectItems } from "@/lib/selectOptions.js";

const Add = () => {
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);

  const [category, setCategory] = useState([]);

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    stock: "",
    color: "#3b82f6",
    image: "",
    category_id: "",
    status: "draft",
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

      const res = await API.post("/products", data);

      toast.success(res.data.message || "Product added successfully.");

      navigate("/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add product.");
    } finally {
      setLoading(false);
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
            <h1 className="text-3xl font-bold text-gray-900">New Product</h1>

            <p className="text-gray-500 mt-2">
              Add a product to your catalogue. You can save as draft or publish
              immediately.
            </p>
          </div>

          {/* Product Details */}
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

          {/* Image Upload */}
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
                Upload a clear image of your product.
              </FieldDescription>
            </Field>

            {preview && (
              <div className="mt-5">
                <img
                  src={preview}
                  alt=""
                  className="h-48 w-48 rounded-xl object-cover border"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="space-y-6">
          {/* Publish Card */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={addProduct}
                className="flex-1 h-11 text-base"
              >
                Save Product
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/admin/products")}
                className="flex-1 h-11 text-base"
              >
                Go Back
              </Button>
            </div>

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
            <div className="flex items-center justify-between">
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

          {/* Inventory Card */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
            <h2 className="font-semibold text-lg">Inventory</h2>

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

          {/* Category & Color */}
          <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
            <h2 className="font-semibold text-lg">Product Options</h2>

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

              <div className="mt-2">
                <Input
                  type="color"
                  value={form.color}
                  className="h-12 w-20 p-1 cursor-pointer"
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
    </div>
  );
};

export default Add;
