import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { ElMessage } from 'element-plus';
import { appConfig } from '@/config/env';

function createRequest(baseURL: string, timeout: number): AxiosInstance {
  const request = axios.create({
    baseURL,
    timeout,
  });

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

const request = createRequest(appConfig.api.basePath, appConfig.api.timeout);

export const emulatorRequest = createRequest(
  appConfig.emulatorApi.basePath,
  appConfig.emulatorApi.timeout,
);

export default request;
