import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import API from "../../API/api.js";

const CustomerShopContext = createContext(null);
const inFlightCollections = new Map();

const asRows = (data) => Array.isArray(data) ? data : [];

const loadCollections = (userId) => {
  if (inFlightCollections.has(userId)) return inFlightCollections.get(userId);
  const request = Promise.allSettled([API.get("/cart"), API.get("/wishlist/")]);
  inFlightCollections.set(userId, request);
  request.finally(() => {
    if (inFlightCollections.get(userId) === request) inFlightCollections.delete(userId);
  });
  return request;
};

export const CustomerShopProvider = ({ user, children }) => {
  const [cartItems, setCartItems] = useState([]);
  const cartItemsRef = useRef(cartItems);
  const [wishlistItems, setWishlistItems] = useState([]);
  const wishlistItemsRef = useRef(wishlistItems);
  const activeUserId = useRef(user?.id || null);
  const cartRequestSequence = useRef(0);
  const wishlistRequestSequence = useRef(0);
  const [cartLoading, setCartLoading] = useState(Boolean(user?.id));
  const [wishlistLoading, setWishlistLoading] = useState(Boolean(user?.id));
  const [cartLoaded, setCartLoaded] = useState(false);
  const [wishlistLoaded, setWishlistLoaded] = useState(false);

  cartItemsRef.current = cartItems;
  wishlistItemsRef.current = wishlistItems;

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      activeUserId.current = null;
      cartRequestSequence.current += 1;
      wishlistRequestSequence.current += 1;
      setCartItems([]);
      cartItemsRef.current = [];
      setWishlistItems([]);
      wishlistItemsRef.current = [];
      setCartLoaded(false);
      setWishlistLoaded(false);
      setCartLoading(false);
      setWishlistLoading(false);
      return () => { active = false; };
    }

    if (activeUserId.current !== user.id) {
      activeUserId.current = user.id;
      cartRequestSequence.current += 1;
      wishlistRequestSequence.current += 1;
      setCartItems([]);
      cartItemsRef.current = [];
      setWishlistItems([]);
      wishlistItemsRef.current = [];
      setCartLoaded(false);
      setWishlistLoaded(false);
    }
    const cartRequestId = ++cartRequestSequence.current;
    const wishlistRequestId = ++wishlistRequestSequence.current;
    setCartLoading(true);
    setWishlistLoading(true);
    loadCollections(user.id).then(([cartResult, wishlistResult]) => {
      if (!active) return;
      if (cartRequestId === cartRequestSequence.current && cartResult.status === "fulfilled") {
        const items = asRows(cartResult.value.data);
        cartItemsRef.current = items;
        setCartItems(items);
        setCartLoaded(true);
      } else if (cartRequestId === cartRequestSequence.current) {
        setCartLoaded(false);
      }
      if (wishlistRequestId === wishlistRequestSequence.current && wishlistResult.status === "fulfilled") {
        const items = asRows(wishlistResult.value.data);
        wishlistItemsRef.current = items;
        setWishlistItems(items);
        setWishlistLoaded(true);
      } else if (wishlistRequestId === wishlistRequestSequence.current) {
        setWishlistLoaded(false);
      }
    }).finally(() => {
      if (!active) return;
      if (cartRequestId === cartRequestSequence.current) setCartLoading(false);
      if (wishlistRequestId === wishlistRequestSequence.current) setWishlistLoading(false);
    });
    return () => { active = false; };
  }, [user?.id]);

  const refreshCart = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return [];
    const requestId = ++cartRequestSequence.current;
    if (!silent) setCartLoading(true);
    try {
      const response = await API.get("/cart");
      const items = asRows(response.data);
      if (requestId === cartRequestSequence.current) {
        cartItemsRef.current = items;
        setCartItems(items);
        setCartLoaded(true);
      }
      return items;
    } catch {
      return null;
    } finally {
      if (requestId === cartRequestSequence.current) setCartLoading(false);
    }
  }, [user?.id]);

  const refreshWishlist = useCallback(async () => {
    if (!user?.id) return [];
    const requestId = ++wishlistRequestSequence.current;
    setWishlistLoading(true);
    try {
      const response = await API.get("/wishlist/");
      const items = asRows(response.data);
      if (requestId === wishlistRequestSequence.current) {
        wishlistItemsRef.current = items;
        setWishlistItems(items);
        setWishlistLoaded(true);
      }
      return items;
    } catch {
      return null;
    } finally {
      if (requestId === wishlistRequestSequence.current) setWishlistLoading(false);
    }
  }, [user?.id]);

  const updateCartItem = useCallback((productId, quantity, product = {}) => {
    const id = Number(productId);
    if (!Number.isFinite(id)) return;
    const current = cartItemsRef.current;
    const existing = current.find((item) => Number(item.product_id) === id);
    const next = quantity <= 0
      ? current.filter((item) => Number(item.product_id) !== id)
      : existing
        ? current.map((item) => Number(item.product_id) === id ? { ...item, quantity } : item)
        : [...current, { ...product, id: `pending-${id}`, product_id: id, quantity }];
    cartItemsRef.current = next;
    setCartItems(next);
    setCartLoaded(true);
  }, []);

  const addCartItem = useCallback((productId, quantity, product = {}) => {
    const id = Number(productId);
    const existing = cartItemsRef.current.find((item) => Number(item.product_id) === id);
    updateCartItem(id, (Number(existing?.quantity) || 0) + (Number(quantity) || 1), product);
  }, [updateCartItem]);

  const clearCart = useCallback(() => {
    cartItemsRef.current = [];
    setCartItems([]);
    setCartLoaded(true);
  }, []);

  const toggleWishlist = useCallback(async (productId, product = {}) => {
    const id = Number(productId);
    if (!Number.isFinite(id)) throw new Error("This product cannot be added to your wishlist.");
    const hadItem = wishlistItemsRef.current.some((item) => Number(item.product_id) === id);
    const savedItem = wishlistItemsRef.current.find((item) => Number(item.product_id) === id) || {
      ...product,
      id,
      product_id: id,
    };
    const updateItems = (updater) => {
      const items = updater(wishlistItemsRef.current);
      wishlistItemsRef.current = items;
      setWishlistItems(items);
    };

    if (user?.id) {
      wishlistRequestSequence.current += 1;
      setWishlistLoading(false);
      updateItems((items) => hadItem
        ? items.filter((item) => Number(item.product_id) !== id)
        : [...items, { ...product, id, product_id: id }]);
      setWishlistLoaded(true);
    }

    try {
      if (hadItem) await API.delete(`/wishlist/${id}`);
      else await API.post("/wishlist", { product_id: id });
    } catch (error) {
      if (user?.id) {
        updateItems((items) => hadItem
          ? items.some((item) => Number(item.product_id) === id) ? items : [...items, savedItem]
          : items.filter((item) => Number(item.product_id) !== id));
      }
      throw error;
    }

    return { added: !hadItem };
  }, [user?.id]);

  const wishlistIds = useMemo(() => new Set(wishlistItems.map((item) => Number(item.product_id))), [wishlistItems]);
  const cartCount = cartItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  const wishlistCount = wishlistIds.size;
  const value = useMemo(() => ({
    cartItems,
    wishlistItems,
    cartCount,
    wishlistCount,
    wishlistIds,
    cartLoading,
    wishlistLoading,
    cartLoaded,
    wishlistLoaded,
    refreshCart,
    refreshWishlist,
    updateCartItem,
    addCartItem,
    clearCart,
    toggleWishlist,
  }), [cartItems, wishlistItems, cartCount, wishlistCount, wishlistIds, cartLoading, wishlistLoading, cartLoaded, wishlistLoaded, refreshCart, refreshWishlist, updateCartItem, addCartItem, clearCart, toggleWishlist]);

  return <CustomerShopContext.Provider value={value}>{children}</CustomerShopContext.Provider>;
};

export const useCustomerShop = () => {
  const context = useContext(CustomerShopContext);
  if (!context) throw new Error("useCustomerShop must be used inside CustomerShopProvider.");
  return context;
};
