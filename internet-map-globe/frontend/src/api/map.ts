import request from '@/utils/request'
import type { BgpPeer } from '@/utils/types'

export interface containerType{
    id: string,
    name: string,
    entryPoint?: string,
    version?: string,
}

export interface networkType{
    id: string,
    name: string,
    entryPoint?: string,
    version?: string,
}
export const URL = {
    CONTAINER_URL: '/container',
    NETWORK_URL: '/network',
} as const

export interface ApiRespond<ResultType> {
    ok: boolean;
    result: ResultType;
}

export const reqGetContainersList = (params: {}): Promise<ApiRespond<any>> => {
    return request.get(
        URL.CONTAINER_URL,
        {params}
    )
}

export const reqGetNetworksList = (params: {}): Promise<ApiRespond<any>> => {
    return request.get(
        URL.NETWORK_URL,
        {params}
    )
}

export const reqGetBgpPeers = (nodeId: string): Promise<ApiRespond<BgpPeer[]>> => {
    return request.get(`${URL.CONTAINER_URL}/${nodeId}/bgp`)
}

export const reqSetBgpPeer = (
    nodeId: string,
    peerName: string,
    enabled: boolean,
): Promise<ApiRespond<unknown>> => {
    return request.post(`${URL.CONTAINER_URL}/${nodeId}/bgp/${peerName}`, {
        status: enabled,
    })
}

export const reqGetNetworkStatus = (nodeId: string): Promise<ApiRespond<boolean>> => {
    return request.get(`${URL.CONTAINER_URL}/${nodeId}/net`)
}

export const reqSetNetworkStatus = (
    nodeId: string,
    enabled: boolean,
): Promise<ApiRespond<unknown>> => {
    return request.post(`${URL.CONTAINER_URL}/${nodeId}/net`, {
        status: enabled,
    })
}
