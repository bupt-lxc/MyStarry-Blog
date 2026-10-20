#!/bin/sh
# Run as root from this directory: ./install-publisher.sh <public-key-file>
set -eu
test "$(id -u)" = 0 || { echo 'Root is required for one-time installation.' >&2; exit 1; }
test "$#" = 1 && test -f "$1" || { echo 'Provide one Ed25519 public-key file.' >&2; exit 1; }
public_key=$(cat "$1")
case "$public_key" in
  'ssh-ed25519 '*) ;;
  *) echo 'An Ed25519 public key is required.' >&2; exit 1 ;;
esac
test "$(printf '%s\n' "$public_key" | wc -l)" -eq 1
test -f publisher.py
if ! id mystarry-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/sh mystarry-deploy
fi
# This account is key-only and deliberately receives no docker-group membership.
usermod --lock mystarry-deploy
chown root:root /home/mystarry-deploy
chmod 0755 /home/mystarry-deploy
install -d -o root -g root -m 0755 /usr/local/lib/mystarry
install -o root -g root -m 0755 publisher.py /usr/local/lib/mystarry/publisher.py
cat > /usr/local/lib/mystarry/gateway.sh <<'SH'
#!/bin/sh
exec /usr/bin/sudo -n /usr/local/lib/mystarry/publisher.py "${SSH_ORIGINAL_COMMAND:-}"
SH
chown root:root /usr/local/lib/mystarry/gateway.sh
chmod 0755 /usr/local/lib/mystarry/gateway.sh
sudoers=$(mktemp)
trap 'rm -f "$sudoers"' EXIT
printf '%s\n' 'mystarry-deploy ALL=(root) NOPASSWD: /usr/local/lib/mystarry/publisher.py' > "$sudoers"
visudo -cf "$sudoers"
install -o root -g root -m 0440 "$sudoers" /etc/sudoers.d/mystarry-deploy
install -d -o root -g root -m 0700 /home/mystarry-deploy/.ssh
printf 'restrict,command="/usr/local/lib/mystarry/gateway.sh" %s\n' "$public_key" > /home/mystarry-deploy/.ssh/authorized_keys
chown root:root /home/mystarry-deploy/.ssh/authorized_keys
chmod 0600 /home/mystarry-deploy/.ssh/authorized_keys
# sshd reads authorized_keys with the user's uid, so make the root-owned key
# directory traversable and key readable while denying writes to the account.
chmod 0755 /home/mystarry-deploy/.ssh
chmod 0644 /home/mystarry-deploy/.ssh/authorized_keys
echo 'Restricted website deployment account installed.'
