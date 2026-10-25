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
import { useState } from "react";
import API from "../../../../API/api.js";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

const Add = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
  });

  const addProduct = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await API.post("/category", form);

      toast.success(res.data.message || "Category added successfully.");

      onSuccess();

      setForm({
        name: "",
      });

      setOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add category.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            className="
            bg-primary
hover:bg-primary/90
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          text-primary-foreground
          rounded-lg
          px-5
          py-2.5
          cursor-pointer
        "
          >
            + Add Category
          </Button>
        }
      />

      <DialogContent>
        {loading && (
          <div
            className="
          absolute
          inset-0
          z-50
          flex
          items-center
          justify-center
          bg-white/80
          rounded-lg
        "
          >
            <Spinner className="size-7" />
          </div>
        )}

        <form onSubmit={addProduct}>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>

            <DialogDescription>
              Create a new category for organizing your products.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-6">
            <Field>
              <Label htmlFor="name-1">Category Name</Label>

              <Input
                id="name-1"
                name="name"
                placeholder="Enter category name"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                className="mt-2"
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button variant="outline" disabled={loading}>
                  Cancel
                </Button>
              }
            />

            <Button
              type="submit"
              disabled={loading}
              className="
           bg-primary
hover:bg-primary/90
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          "
            >
              {loading ? "Adding..." : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Add;
