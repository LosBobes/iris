# Iris on-premises in a Hyper-V VM (step by step)

This runs Iris on the client's Windows Server inside a small **Ubuntu Server
VM** (Hyper-V), with Docker Engine running the same `docker-compose.yml` as
every other install. It works on **Windows Server 2016, 2019, 2022 and 2025**
(2012 and 2012 R2 with the changes in
[Windows Server 2012 / 2012 R2](#windows-server-2012--2012-r2)), and needs no
signed-in user: the VM starts with the host, Docker starts with
the VM, the containers start with Docker.

```
 shop PCs ──http──▶  VM "iris" (own LAN IP, Ubuntu 24.04)
                       └─ docker compose: frontend :80 → backend → db (PostgreSQL 16)
                     on the Windows Server's Hyper-V
```

Files from this folder that go into the VM (`/opt/iris`):

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The stack (db + backend + frontend) |
| `onprem.env.example` | Template for `.env` |
| `update.sh` | Pull new images, recreate containers (nightly, cron) |
| `backup.sh` | `pg_dump` to `backups/`, keep 14, copy to the NAS (nightly, cron) |
| `restore.sh` | Load a dump: the Hetzner cutover, or a backup |
| `install-cron.sh` | Installs `/etc/cron.d/iris` for the two nightly jobs |

The work is in three phases: **A. prepare** (no downtime, can be days
before), **B. cutover** (about 15 minutes of downtime), **C. after**.

---

## Windows Server 2012 / 2012 R2

It works, with three changes. **Weigh it first:** Microsoft ended support for
2012 and 2012 R2 in October 2023, and the paid extended security updates
ended in October 2026, so the host no longer gets security fixes. A separate
small machine running Ubuntu directly (skip the Hyper-V steps, start at A7)
is the safer home for Iris. If it has to be this server:

1. **Creating the VM (A4) differs.** Plain 2012 has only Generation 1 VMs;
   2012 R2 has Generation 2 but no Secure Boot template for Linux (that came
   with 2016), so Secure Boot is switched off. Both variants are in A4.
2. **Tailscale does not run on the host.** The current client needs Windows
   10 or Server 2016 or newer
   ([Tailscale](https://tailscale.com/docs/reference/troubleshooting/windows/supported-windows-versions)).
   The Iris VM becomes the gateway instead: it advertises a route to the
   host, and you reach the host's Remote Desktop through it (A7b).
3. **The first steps happen on site** (or by their IT person): until the VM
   exists there is no Tailscale gateway. Enable RDP, install Hyper-V and
   create the VM there; from A7b on everything works remotely. An always-on
   Windows 10/11 PC in the shop can serve as a temporary gateway with the
   same route (A7b).

Everything else (Hyper-V role, switch, address, Docker, backups, cutover) is
the same. Download the Ubuntu ISO on another PC and copy it over: the old
browser on 2012 may not manage the download.

## A. Prepare

### A1. Check the host

On the Windows Server, in PowerShell:

```powershell
winver
(Get-CimInstance Win32_ComputerSystem).Model
```

On 2012 or 2012 R2, read
[Windows Server 2012 / 2012 R2](#windows-server-2012--2012-r2) first.

If it prints `Virtual Machine`, the Windows Server is itself a VM: Hyper-V
then needs nested virtualization enabled by whoever runs that host. Ask
before going on.

You need about **2 CPU cores, 4 GB RAM and 60 GB disk** to spare for the VM.

### A2. Install Hyper-V (skip if it is already there)

```powershell
Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart
```

The server restarts. Do it out of hours.

### A3. Create the network switch (skip if one exists)

The VM needs its own address on the shop LAN, through an **external** virtual
switch. List the existing ones and the network adapters:

```powershell
Get-VMSwitch
Get-NetAdapter
```

If there is no external switch, create one on the adapter that is connected
to the LAN (here `Ethernet`):

```powershell
New-VMSwitch -Name "LAN" -NetAdapterName "Ethernet" -AllowManagementOS $true
```

**The host loses its network for a few seconds while this runs.** Do it at
the console or out of hours, not over a remote session you cannot get back to.

### A4. Create the VM

Download the **Ubuntu Server 24.04 LTS** ISO to the server (for example
`C:\ISO\ubuntu-24.04-live-server-amd64.iso`). Then, adjusting the paths:

```powershell
New-VM -Name iris -Generation 2 -MemoryStartupBytes 4GB -SwitchName "LAN" -NewVHDPath "C:\Hyper-V\iris.vhdx" -NewVHDSizeBytes 60GB
Set-VM -Name iris -ProcessorCount 2 -StaticMemory -AutomaticStartAction Start -AutomaticStartDelay 60 -AutomaticStopAction ShutDown
Set-VMFirmware -VMName iris -SecureBootTemplate MicrosoftUEFICertificateAuthority
Add-VMDvdDrive -VMName iris -Path "C:\ISO\ubuntu-24.04-live-server-amd64.iso"
Set-VMFirmware -VMName iris -FirstBootDevice (Get-VMDvdDrive -VMName iris)
Start-VM -Name iris
```

`AutomaticStartAction Start` brings the VM up after every host reboot;
`AutomaticStopAction ShutDown` shuts it down cleanly when the host goes down,
so PostgreSQL is never cut off mid-write. The Secure Boot template line is
required: Ubuntu does not boot with the default (Windows-only) template.

Open the console: Hyper-V Manager → `iris` → Connect.

**Windows Server 2012 R2** (Generation 2, Secure Boot off; there is no Linux
template):

```powershell
New-VM -Name iris -Generation 2 -MemoryStartupBytes 4GB -SwitchName "LAN" -NewVHDPath "C:\Hyper-V\iris.vhdx" -NewVHDSizeBytes 60GB
Set-VM -Name iris -ProcessorCount 2 -StaticMemory -AutomaticStartAction Start -AutomaticStartDelay 60 -AutomaticStopAction ShutDown
Set-VMFirmware -VMName iris -EnableSecureBoot Off
Add-VMDvdDrive -VMName iris -Path "C:\ISO\ubuntu-24.04-live-server-amd64.iso"
Set-VMFirmware -VMName iris -FirstBootDevice (Get-VMDvdDrive -VMName iris)
Start-VM -Name iris
```

**Windows Server 2012** (not R2; Generation 1 only, so no `-Generation` and
no `Set-VMFirmware`, which do not exist there). A Generation 1 VM already has
a DVD drive and boots from it first:

```powershell
New-VM -Name iris -MemoryStartupBytes 4GB -SwitchName "LAN" -NewVHDPath "C:\Hyper-V\iris.vhdx" -NewVHDSizeBytes 60GB
Set-VM -Name iris -ProcessorCount 2 -StaticMemory -AutomaticStartAction Start -AutomaticStartDelay 60 -AutomaticStopAction ShutDown
Set-VMDvdDrive -VMName iris -Path "C:\ISO\ubuntu-24.04-live-server-amd64.iso"
Start-VM -Name iris
```

### A5. Install Ubuntu

Go through the installer with the defaults, except:

- **Network:** either leave DHCP and reserve the address in the router later
  (A6), or set a static IPv4 here (Edit IPv4 → Manual: subnet, address,
  gateway, DNS from the shop's network).
- **Storage:** use the entire disk. On the summary screen check the size of
  the `/` volume: with LVM the installer may give it only part of the disk.
  If so, edit it and set it to the maximum.
- **Profile:** your name, server name `iris`, username e.g. `iris`, a strong
  password (keep it in your password manager).
- **SSH:** tick **Install OpenSSH server**.
- **Featured snaps:** select **nothing**. In particular not `docker`: the snap
  version does not work with this setup.

Reboot when asked. In Hyper-V Manager, if the installer ISO boots again, remove
it: `Get-VMDvdDrive -VMName iris | Remove-VMDvdDrive` (on plain 2012, eject it
instead: `Set-VMDvdDrive -VMName iris -Path $null`).

### A6. Pin the address

If you used DHCP, pin the VM's MAC address (Hyper-V can otherwise give it a
new one) and reserve its IP in the shop's router:

```powershell
Stop-VM -Name iris
$mac = (Get-VMNetworkAdapter -VMName iris).MacAddress; $mac
Set-VMNetworkAdapter -VMName iris -StaticMacAddress $mac
Start-VM -Name iris
```

Use the printed MAC for the DHCP reservation. Optional: a DNS name such as
`iris.local` pointing at that IP, on their router or domain controller.

From here on, work over SSH from your laptop (`ssh iris@<vm-ip>`).

### A7. Install Docker

```bash
sudo apt update && sudo apt full-upgrade -y
sudo timedatectl set-timezone Europe/Belgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Sign out and back in (so the `docker` group applies), then check:

```bash
docker run --rm hello-world
```

Ubuntu installs security updates by itself (unattended-upgrades). Optional,
to also let it reboot for kernel updates at a quiet hour, set in
`/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
```

### A7b. Remote access (Remote Desktop and Tailscale)

For maintenance from outside the shop. **Never forward port 3389 (RDP) on
their router**: exposed RDP is attacked within hours. Outside access goes
through [Tailscale](https://tailscale.com), a private network between your
devices that only makes outbound connections. The free plan is enough.

**Remote Desktop on the host** (once, on site or by their IT, any version
including 2012):

```powershell
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name UserAuthentication -Value 1
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"
```

Use a named admin account for yourself, not a shared `Administrator`.

**Tailscale on the VM** (every version):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Open the printed link and sign in. In the Tailscale admin console, **Machines
→ the VM → Disable key expiry**, or it drops off after about 180 days. From
then on: `ssh iris@iris` (MagicDNS name) or `ssh iris@100.x.y.z`, and Iris
itself at `http://100.x.y.z/` for support.

**Reaching the host's Remote Desktop:**

- **Server 2016 or newer:** install Tailscale on the host too
  (`tailscale.com/download`). Sign in, or let their IT connect it with a
  one-time auth key (admin console → Settings → Keys) in an admin PowerShell:
  `& "C:\Program Files\Tailscale\tailscale.exe" up --authkey=tskey-auth-... --unattended`.
  `--unattended` keeps it connected with nobody signed in. Disable key expiry
  for it as well, then `mstsc /v:<server-tailscale-name>`.
- **Server 2012 / 2012 R2:** the VM forwards to the host (a Tailscale
  *subnet router*). On the VM:

  ```bash
  echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf && sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
  sudo tailscale up --advertise-routes=<host-lan-ip>/32
  ```

  Approve the route in the admin console (**Machines → the VM → Edit route
  settings**). `/32` exposes only the host, not the shop's whole network.
  Then, from your laptop with Tailscale on: `mstsc /v:<host-lan-ip>`. On a
  Linux laptop, accept routes first: `sudo tailscale set --accept-routes`.
  Before the VM exists, an always-on Windows 10/11 PC in the shop can do the
  same job: install Tailscale there and run
  `& "C:\Program Files\Tailscale\tailscale.exe" up --advertise-routes=<host-lan-ip>/32 --unattended`.

If RDP works on the LAN but not over Tailscale, the firewall rule is limited
to some network profiles: re-run
`Enable-NetFirewallRule -DisplayGroup "Remote Desktop"` on the host. Keep a
list of who has access, and remove devices from the Tailscale console when
they are no longer needed.

### A8. Copy the files

On the VM:

```bash
sudo mkdir -p /opt/iris && sudo chown $USER: /opt/iris
```

From your laptop, in an up-to-date checkout of `main`:

```bash
scp deploy/docker-compose.yml deploy/onprem.env.example deploy/update.sh deploy/backup.sh deploy/restore.sh deploy/install-cron.sh iris@<vm-ip>:/opt/iris/
```

### A9. Create `.env`

On the VM:

```bash
cd /opt/iris
chmod +x *.sh
pw=$(openssl rand -hex 24)
sed "s/<hex-password>/$pw/g" onprem.env.example > .env
chmod 600 .env
cat .env
```

It holds `COMPOSE_PROFILES=postgres`, the generated `POSTGRES_PASSWORD`, the
matching `DATABASE_URL`, `IRIS_ENV=production`, and `IRIS_SECURE_COOKIES=false`.
That last one is needed because the shop uses plain `http://`, and browsers
refuse to store `Secure` cookies over http, so sign-in would silently bounce
back to the login screen. PostgreSQL keeps the **first** password its volume
was created with: don't change `POSTGRES_PASSWORD` later.

### A10. Mount the NAS for backups

A backup that sits only on the VM's disk dies with the server. Make a share
on their NAS or another PC (for example `\\nas\iris-backups`, with a user
that may write to it), then on the VM:

```bash
sudo apt install -y cifs-utils
sudo mkdir -p /mnt/iris-backups
sudo install -m 600 /dev/null /root/.smb-iris
sudo nano /root/.smb-iris
```

with:

```
username=<share user>
password=<share password>
domain=<WORKGROUP or domain>
```

Then:

```bash
echo '//nas/iris-backups /mnt/iris-backups cifs credentials=/root/.smb-iris,uid=0,gid=0,file_mode=0600,dir_mode=0700,vers=3.0,_netdev,nofail 0 0' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount -a
mountpoint /mnt/iris-backups
```

It must print `is a mountpoint`. Replace `//nas/iris-backups` with the real
share (an IP works too: `//192.168.1.10/iris-backups`). Then set the mirror
in `backup.sh`:

```bash
sed -i 's|^MIRROR_DIR=""|MIRROR_DIR="/mnt/iris-backups"|' /opt/iris/backup.sh
```

If the share is ever not mounted, `backup.sh` fails loudly instead of
silently keeping the copy only on the VM.

### A11. Start the database

```bash
cd /opt/iris
docker compose pull
docker compose up -d db
docker compose ps db
```

Wait until it says `(healthy)`.

### A12. Rehearse with a copy of the real data (strongly recommended)

This tests the whole path while Hetzner keeps running. Whatever happens on
the rehearsal copy is overwritten at the cutover.

On the VM (it can reach Hetzner over SSH; otherwise go through your laptop
with two `scp`s):

```bash
ssh root@<hetzner-ip> 'cd /opt/iris && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U iris -d iris --format=custom' > /opt/iris/rehearsal.dump
ls -l /opt/iris/rehearsal.dump
./restore.sh /opt/iris/rehearsal.dump
```

Type `RESTORE` when asked. Then from a shop PC open `http://<vm-ip>/`:

- organization `grafika-cobanovic`, sign in, open a few orders, print a PDF;
- `/backoffice` (tap the "Iris" wordmark 5×), sign in with your superadmin
  and authenticator code.

Fix anything that fails now. Tell people not to work in the rehearsal copy.
Afterwards: `rm /opt/iris/rehearsal.dump` (it holds password hashes).

### A13. Backup and nightly jobs

```bash
cd /opt/iris
./backup.sh
ls -l backups/ /mnt/iris-backups/
sudo ./install-cron.sh
```

The new dump must be in both folders. Cron now runs `backup.sh` at 02:15 and
`update.sh` at 03:00.

### A14. Reboot test

Restart the **Windows Server** (out of hours) and touch nothing. A few minutes
after it is up, `http://<vm-ip>/` must load by itself.

---

## B. Cutover (about 15 minutes of downtime)

### B1. Before

- Tell the shop Iris is down for about 15 minutes.
- GitHub → **Actions → Deploy to Hetzner → ··· → Disable workflow**, and
  merge nothing during the cutover. Keep it disabled afterwards: a later merge
  would start the old stack again and people could keep working there.
- On the VM: `cd /opt/iris && docker compose pull` (the newest images; they
  are at least the version Hetzner runs, since every merge publishes both).

### B2. Stop Hetzner and dump

On Hetzner:

```bash
cd /opt/iris
C="docker compose -f docker-compose.prod.yml"
export IRIS_IMAGE_TAG="$(docker inspect --format '{{.Config.Image}}' "$($C ps -q backend)" | sed 's/.*://')"; echo "$IRIS_IMAGE_TAG"
```

It must print `git-xxxxxxx`. Then:

```bash
$C stop frontend backend
$C exec -T db pg_dump -U iris -d iris --format=custom > iris-cutover.dump
sha256sum iris-cutover.dump
$C exec -T db psql -U iris -d iris -c "select (select count(*) from tenants) tenants, (select count(*) from users) users, (select count(*) from customers) customers, (select count(*) from work_orders) work_orders, (select count(*) from catalog_items) catalog_items"
```

Write down the counts.

### B3. Copy and restore

On the VM:

```bash
cd /opt/iris
scp root@<hetzner-ip>:/opt/iris/iris-cutover.dump .
sha256sum iris-cutover.dump
./restore.sh /opt/iris/iris-cutover.dump
```

The checksum must match B2. Type `RESTORE` when asked.

### B4. Verify

```bash
docker compose ps
docker compose logs backend | grep storage
docker compose exec -T db psql -U iris -d iris -c "select (select count(*) from tenants) tenants, (select count(*) from users) users, (select count(*) from customers) customers, (select count(*) from work_orders) work_orders, (select count(*) from catalog_items) catalog_items"
```

`backend` must be `(healthy)` and `frontend` `Up`; the log must say
`using postgres storage`; the counts must equal B2. In a browser:

- sign in to `grafika-cobanovic`; the order list total matches;
- search a customer in lowercase and without diacritics;
- print a PDF;
- create a test order: it gets the next order number (then cancel it);
- sign in to the Backoffice.

### B5. Go live

Give the shop the new address. Every device enters `grafika-cobanovic` once
and everyone signs in again.

---

## C. After

- **Next morning:** `tail /opt/iris/backup.log /opt/iris/update.log` and check
  a new dump reached the NAS.
- **Backoffice → Organizacije:** suspend, then delete `demo` and any other
  organization that should not live on-premises.
- **Dump copies:** delete `iris-cutover.dump` from Hetzner and keep one copy
  only somewhere safe (it holds password hashes).
- **Hetzner:** leave the stack stopped, nothing removed, for 2 to 4 weeks.
  Rollback in that window is `$C up -d` there; anything entered on-premises
  since the cutover is not in it.
- **Public tracking links** only open inside the shop's network now.

## Everyday operations

| Task | Command (in `/opt/iris`) |
| --- | --- |
| Status | `docker compose ps` |
| Logs | `docker compose logs -f backend` |
| Update now | `./update.sh` |
| Backup now | `./backup.sh` |
| Restore a backup | `./restore.sh backups/iris-YYYYMMDD-HHMMSS.dump` |
| Pin a version | replace `:latest` in `docker-compose.yml` with `:git-<sha7>`, then `docker compose up -d` |

`restore.sh` always takes a `backups/pre-restore-*.dump` of the current state
first, so a wrong restore can itself be undone.

**Do not move PostgreSQL to version 18.** The compose file pins
`postgres:16.15`; the 18 image keeps its data under a different path, so the
existing volume would not be used. A major upgrade is a dump and a restore,
planned separately.

As an extra layer, the host's backup (Windows Server Backup or whatever they
use) can include the VM's `.vhdx`. That restores the whole machine, but the
nightly `pg_dump` on the NAS stays the backup to rely on for the data.
