// import React from "react";
// import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import API from "../../../API/api.js";
import Add from "./controllers/Add.jsx";
import Edit from "./controllers/Edit.jsx";
import Delete from "./controllers/Delete.jsx";

import { Spinner } from "@/components/ui/spinner";

const Controllers = () => {
  const [category, setCategory] = useState([]);
  const [loading, setLoading] = useState(false);

  const [val, setVal] = useState(1);

  const refreshItem = async () => {
    setVal((prev) => prev + 1);
  };

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        setLoading(true);

        const res = await API.get("/category");

        setCategory(
          res.data.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        );
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchCategory();
  }, [val]);

  return (
    <div className="min-h-screen bg-gray-100 p-6 sm:p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Category Management
          </h1>

          <p className="text-gray-500 mt-2">
            Create, edit, and manage your product categories.
          </p>
        </div>

        {/* Add Category */}
        <div
          className="
        bg-white
        rounded-2xl
        border
        shadow-sm
        p-6
      "
        >
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Add New Category</h2>

            <p className="text-sm text-gray-500 mt-1">
              Add categories to organize your products.
            </p>
          </div>

          <Add onSuccess={refreshItem} />
        </div>

        {/* Category List */}
        <div
          className="
        bg-white
        rounded-2xl
        border
        shadow-sm
        p-6
      "
        >
          <div
            className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
          mb-6
        "
          >
            <div>
              <h2 className="text-xl font-semibold">Categories</h2>

              <p className="text-sm text-gray-500 mt-1">
                View and manage available categories.
              </p>
            </div>

            <span
              className="
            bg-indigo-100
            text-indigo-700
            px-4
            py-2
            rounded-full
            text-sm
            font-semibold
            w-fit
          "
            >
              {category.length} Categories
            </span>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center">
              <Spinner className="size-6" />
            </div>
          ) : category.length === 0 ? (
            <div
              className="
            py-16
            text-center
            text-gray-500
          "
            >
              <h3 className="text-lg font-semibold text-gray-700">
                No categories found
              </h3>

              <p className="mt-2 text-sm">
                Create your first category to get started.
              </p>
            </div>
          ) : (
            <div
              className="
            grid
            grid-cols-1
            sm:grid-cols-2
            lg:grid-cols-3
            gap-6
          "
            >
              {category.map((c) => (
                <div
                  key={c.id}
                  className="
                group
                rounded-2xl
                border
                bg-gray-50
                p-6
                hover:bg-white
                hover:shadow-md
                transition
              "
                >
                  <div
                    className="
                  flex
                  items-start
                  justify-between
                "
                  >
                    <div>
                      <h3
                        className="
                      text-xl
                      font-semibold
                      text-gray-900
                    "
                      >
                        {c.name}
                      </h3>

                      <p
                        className="
                      text-sm
                      text-gray-500
                      mt-2
                    "
                      >
                        Category ID: #{c.id}
                      </p>
                    </div>

                    <div
                      className="
                    w-10
                    h-10
                    rounded-xl
                    bg-indigo-100
                    text-indigo-600
                    flex
                    items-center
                    justify-center
                    font-bold
                  "
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div
                    className="
                  flex
                  gap-3
                  mt-6
                  pt-5
                  border-t
                "
                  >
                    <Edit id={c.id} onSuccess={refreshItem} />

                    <Delete id={c.id} onSuccess={refreshItem} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Controllers;
