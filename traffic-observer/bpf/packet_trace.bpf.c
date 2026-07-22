#include "packet_trace.h"
#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/udp.h>
#include <linux/pkt_cls.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

#define IPPROTO_ICMP 1
#define IPPROTO_TCP 6
#define IPPROTO_UDP 17
#ifndef TC_ACT_OK
#define TC_ACT_OK 0
#endif

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct filter_config);
} filter_cfg SEC(".maps");

static __always_inline int read_bytes(struct __sk_buff *skb, __u32 off, void *to, __u32 len)
{
    return bpf_skb_load_bytes(skb, off, to, len);
}

static __always_inline int match_filter(const struct packet_event *event, __u8 direction)
{
    __u32 key = 0;
    struct filter_config *filter = bpf_map_lookup_elem(&filter_cfg, &key);

    if (!filter || !filter->enabled) {
        return 0;
    }

    if (filter->direction != FILTER_DIRECTION_ANY && filter->direction != direction) {
        return 0;
    }

    if (filter->ip_proto != FILTER_PROTO_ANY && filter->ip_proto != event->ip_proto) {
        return 0;
    }

    if (filter->match_src_ip && filter->match_dst_ip && filter->src_ip == filter->dst_ip) {
        if (filter->src_ip != event->src_ip && filter->dst_ip != event->dst_ip) {
            return 0;
        }
    } else {
        if (filter->match_src_ip && filter->src_ip != event->src_ip) {
            return 0;
        }

        if (filter->match_dst_ip && filter->dst_ip != event->dst_ip) {
            return 0;
        }
    }

    if (filter->match_src_port && filter->match_dst_port && filter->src_port == filter->dst_port) {
        if (filter->src_port != event->src_port && filter->dst_port != event->dst_port) {
            return 0;
        }
    } else {
        if (filter->match_src_port && filter->src_port != event->src_port) {
            return 0;
        }

        if (filter->match_dst_port && filter->dst_port != event->dst_port) {
            return 0;
        }
    }

    return 1;
}

static __always_inline void print_packet_event(const struct packet_event *event)
{
    __u32 src_ip = bpf_ntohl(event->src_ip);
    __u32 dst_ip = bpf_ntohl(event->dst_ip);

    bpf_printk(
        "pkt dir=%u if=%u len=%u proto=%u src=0x%x dst=0x%x sport=%u dport=%u",
        event->direction,
        event->ifindex,
        event->packet_len,
        event->ip_proto,
        event->src_ip,
        event->dst_ip,
        event->src_port,
        event->dst_port
    );

    bpf_printk(
        "src=%u.%u.%u.%u sport=%u dst=%u.%u.%u.%u dport=%u",
        (src_ip >> 24) & 0xff,
        (src_ip >> 16) & 0xff,
        (src_ip >> 8) & 0xff,
        src_ip & 0xff,
        event->src_port,
        (dst_ip >> 24) & 0xff,
        (dst_ip >> 16) & 0xff,
        (dst_ip >> 8) & 0xff,
        dst_ip & 0xff,
        event->dst_port
    );
}

static __always_inline int parse_packet(struct __sk_buff *skb, __u8 direction)
{
    struct ethhdr eth = {};
    struct iphdr iph = {};
    struct packet_event event = {};
    __u32 off = 0;

    if (read_bytes(skb, off, &eth, sizeof(eth)) < 0) {
        return TC_ACT_OK;
    }

    event.eth_proto = bpf_ntohs(eth.h_proto);
    event.timestamp_ns = bpf_ktime_get_ns();
    event.ifindex = skb->ifindex;
    event.packet_len = skb->len;
    event.direction = direction;
    __builtin_memcpy(event.src_mac, eth.h_source, sizeof(event.src_mac));
    __builtin_memcpy(event.dst_mac, eth.h_dest, sizeof(event.dst_mac));

    if (event.eth_proto != ETH_P_IP) {
        goto submit_if_matched;
    }

    off += sizeof(eth);
    if (read_bytes(skb, off, &iph, sizeof(iph)) < 0) {
        return TC_ACT_OK;
    }

    if (iph.version != 4 || iph.ihl < 5) {
        return TC_ACT_OK;
    }

    event.ip_proto = iph.protocol;
    event.src_ip = iph.saddr;
    event.dst_ip = iph.daddr;
    event.ttl = iph.ttl;
    event.ip_total_len = bpf_ntohs(iph.tot_len);

    off += iph.ihl * 4;

    if (iph.protocol == IPPROTO_TCP) {
        struct tcphdr tcp = {};
        if (read_bytes(skb, off, &tcp, sizeof(tcp)) < 0) {
            return TC_ACT_OK;
        }
        event.src_port = bpf_ntohs(tcp.source);
        event.dst_port = bpf_ntohs(tcp.dest);
        event.tcp_flags = ((__u8)tcp.fin)
            | ((__u8)tcp.syn << 1)
            | ((__u8)tcp.rst << 2)
            | ((__u8)tcp.psh << 3)
            | ((__u8)tcp.ack << 4)
            | ((__u8)tcp.urg << 5);
    } else if (iph.protocol == IPPROTO_UDP) {
        struct udphdr udp = {};
        if (read_bytes(skb, off, &udp, sizeof(udp)) < 0) {
            return TC_ACT_OK;
        }
        event.src_port = bpf_ntohs(udp.source);
        event.dst_port = bpf_ntohs(udp.dest);
    }

submit_if_matched:
    if (!match_filter(&event, direction)) {
        return TC_ACT_OK;
    }

    print_packet_event(&event);

    struct packet_event *out = bpf_ringbuf_reserve(&events, sizeof(*out), 0);
    if (!out) {
        return TC_ACT_OK;
    }

    __builtin_memcpy(out, &event, sizeof(event));
    bpf_ringbuf_submit(out, 0);

    return TC_ACT_OK;
}

SEC("tc/trace_ingress")
int trace_ingress(struct __sk_buff *skb)
{
    return parse_packet(skb, FILTER_DIRECTION_INGRESS);
}
