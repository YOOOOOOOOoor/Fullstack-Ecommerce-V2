import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import API from "../../../../API/api.js";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

const Edit = ({ onSuccess, id }) => {
  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
  });

  useEffect(() => {
    const fetchCate = async () => {
      try {
        const res = await API.get(`/category/${id}`);

        setForm({
          name: res.data.name,
        });
      } catch (error) {
        toast.error(
          error.response?.data?.message || "Failed to load category.",
        );
      }
    };

    fetchCate();
  }, [id]);

  const EditProduct = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await API.put(`/category/${id}`, form);

      toast.success(res.data.message || "Category updated successfully.");

      onSuccess();

      setForm({
        name: "",
      });

      setOpen(false);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to update category.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 z-50">
          <Spinner className="size-6" />
        </div>
      )}
      <DialogTrigger
        render={
          <Button variant="outline" className="cursor-pointer">
            Edit Category
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={EditProduct}>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">Name</Label>
              <Input
                id="name-1"
                name="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit">Edit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Edit;
