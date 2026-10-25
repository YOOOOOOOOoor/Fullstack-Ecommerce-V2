import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // points to deployed backend
  withCredentials: true, // send cookies with requests
});

export default API;
