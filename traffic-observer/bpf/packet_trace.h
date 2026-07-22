#ifndef PACKET_TRACE_H
#define PACKET_TRACE_H

#include <linux/types.h>

#define FILTER_PROTO_ANY 0
#define FILTER_PROTO_ICMP 1
#define FILTER_PROTO_TCP 6
#define FILTER_PROTO_UDP 17

#define FILTER_DIRECTION_ANY 0
#define FILTER_DIRECTION_INGRESS 1
#define FILTER_DIRECTION_EGRESS 2

struct filter_config {
    __u8 enabled;
    __u8 ip_proto;
    __u8 direction;
    __u8 match_src_ip;
    __u8 match_dst_ip;
    __u8 match_src_port;
    __u8 match_dst_port;
    __u8 reserved;
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
};

struct packet_event {
    __u64 timestamp_ns;
    __u32 ifindex;
    __u32 packet_len;
    __u8 direction;
    __u8 ip_proto;
    __u16 eth_proto;
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8 src_mac[6];
    __u8 dst_mac[6];
    __u8 tcp_flags;
    __u8 ttl;
    __u16 ip_total_len;
};

#endif
