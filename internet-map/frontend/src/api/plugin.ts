import request from '@/utils/request'

const requestConfig = {headers: {'Content-Type': 'application/json;charset=UTF-8'}}
export const URL = {
    INSTALL_URL: '/install',
    UNINSTALL_URL: '/uninstall',
} as const

export interface pluginType{
    id: string,
    name: string,
    entryPoint?: string,
    version?: string,
}
export interface ApiRespond<ResultType> {
    ok: boolean;
    result: ResultType;
}

export const reqGetInstallList = (params: {}): Promise<ApiRespond<pluginType[]>> => {
    return request.get(
        URL.INSTALL_URL,
        {params}
    )
}

export const reqUninstall = (data: pluginType): Promise<ApiRespond<pluginType>> => {
    return request.post(
        URL.UNINSTALL_URL,
        data,
        requestConfig
    )
}

export const reqInstall = (data: pluginType): Promise<ApiRespond<pluginType>> => {
    return request.post(
        URL.INSTALL_URL,
        data,
        requestConfig
    )
}
