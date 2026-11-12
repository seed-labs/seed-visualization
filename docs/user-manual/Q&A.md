# Frequently Asked Questions

## Q1: What should I do if traffic-observer-service reports that a bind-mount source path is missing or cannot be created?

Common mount entries include:

```yaml
volumes:
  - /sys/kernel/debug:/sys/kernel/debug
  - /sys/fs/bpf:/sys/fs/bpf
  - /var/run/docker.sock:/var/run/docker.sock:ro
  - ./traffic-observer-service/pcap:/data/pcap
```

Whether these host paths exist depends on the Linux host running the Docker daemon, its kernel and filesystem mounts, and its Docker configuration. Different Ubuntu 24 point releases or kernel configurations may result in some paths being absent. For example, an older Compose configuration may also include `/sys/kernel/btf:/sys/kernel/btf:ro`. If `/sys/kernel/btf` is absent on the host, Docker may report:

```text
error while creating mount source path '/sys/kernel/btf':
mkdir /sys/kernel/btf: operation not permitted
```

The current traffic-observer-service compiles its eBPF program using Linux UAPI headers. It does not require host mounts for `/sys/kernel/btf` or `/lib/modules`. If you see the error above, check the Compose file, override files, or startup scripts actually being used. Remove these optional mounts and recreate the service. Do not try to create the BTF path manually with `mkdir` under `/sys/kernel`.

`/sys/kernel/debug` and `/sys/fs/bpf` are used by the host eBPF runtime. If either path is missing or not mounted, check them on the Linux host running the Docker daemon:

```bash
ls -ld /sys/kernel/debug /sys/fs/bpf
mountpoint /sys/kernel/debug
mountpoint /sys/fs/bpf
```

Enable the appropriate debugfs and BPF filesystems for your host before starting the service. With Docker Desktop, a remote Docker daemon, or a restricted container environment, also confirm that the daemon can access and bind these host paths. `/var/run/docker.sock` must point to an available Docker socket. `./traffic-observer-service/pcap` is the recording directory relative to the Compose project directory; run Compose from the project root and ensure the Docker daemon can access that directory.

After changing the mounts, recreate the observer container to apply the changes:

```bash
docker compose up -d --force-recreate seedemu_traffic_observer_service
```
