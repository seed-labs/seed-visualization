import axios, { type AxiosError, type AxiosInstance } from 'axios';
import {ElMessage} from "element-plus"

function createRequest(baseURL: string, timeout: number): AxiosInstance {
  const request = axios.create({
    baseURL,
    timeout,
  });

  request.interceptors.request.use((config: any) => {return config})

  request.interceptors.response.use(
    (response) => response.data,
    (error: AxiosError) => {
      const message = error.message || 'Request failed';
      ElMessage({
        type: 'error',
        message,
      });

      return Promise.reject(error);
    },
  );

  return request;
}

export const request = createRequest(import.meta.env.VITE_SERVER_URL_PREFIX, import.meta.env.VITE_SERVER_TIMEOUT);

export const emulatorRequest = createRequest(
  import.meta.env.VITE_SERVER_EMULATOR_URL_PREFIX,
  import.meta.env.VITE_SERVER_TIMEOUT,
);

export default emulatorRequest