<?php
/*
 * B-150: API keys (docs/api-v1-concept.md, sections 5.2-5.6). A key acts as one person (pok_players_tbl.id) in one
 * team; it never expires, deleting the row revokes it. Format "pok_" + 32 characters Base32 (160 bits from
 * random_bytes()); only sha256(key) is stored (binary), plus the last 4 characters (hint) for display. 160 random
 * bits need no salt and no slow hash, and a fast hash allows the direct index lookup.
 * The plain key is marked #[\SensitiveParameter] everywhere (never in stack traces of the PHP log) and is never logged.
 * Lock order (B-155): pok_teams_tbl -> pok_players_tbl -> pok_api_keys_tbl.
 * Requires api/lib.php. Defines functions only, a direct call does nothing.
 */

const API_KEY_PATTERN = '/^pok_[A-Z2-7]{32}$/D';
const API_KEYS_PER_MEMBER = 20;   // keys per person and team (409 limit_reached above)
const API_KEY_NAME_MAX = 40;      // pok_api_keys_tbl.name
const API_KEY_HINT_LENGTH = 4;

/* a new key: "pok_" + 32 characters A-Z2-7 (160 bits) */
function new_api_key(): string
{
    return 'pok_' . random_base32(20);
}

/* what is stored and looked up: sha256 of the full key, binary (32 bytes) */
function api_key_hash(#[\SensitiveParameter] string $key): string
{
    return hash('sha256', $key, true);
}

/*
 * The actor of a key: ['uid', 'team_id', 'role' (PLAYER|OBSERVER|REMOVED), 'via' => 'key', 'key_id'] or null (wrong
 * format, unknown, deleted, or the person is no longer registered in the team - the join makes sure a key without its
 * person never counts). Runs in autocommit BEFORE the transaction of the core function (no locks, no consistent read
 * that would influence it). Afterwards last_used_date, also in autocommit, at most once an hour.
 */
function api_key_lookup(mysqli $link, #[\SensitiveParameter] string $key): ?array
{
    if (!preg_match(API_KEY_PATTERN, $key)) return null;
    $hash = api_key_hash($key);
    $sql = $link->prepare("select k.id, k.user_id, k.team_id, p.player_type
                             from pok_api_keys_tbl k
                             join pok_players_tbl p on p.id = k.user_id and p.team_id = k.team_id
                            where k.key_hash = ?");
    $sql->bind_param('s', $hash);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    $sql->close();
    if (!is_array($row)) return null;

    $id = (int)$row['id'];
    $sql = $link->prepare("update pok_api_keys_tbl set last_used_date = current_timestamp
                            where id = ? and (last_used_date is null or last_used_date < current_timestamp - interval 1 hour)");
    $sql->bind_param('i', $id);
    $sql->execute();
    $sql->close();

    return ['uid' => (string)$row['user_id'], 'team_id' => (string)$row['team_id'],
            'role' => (string)$row['player_type'], 'via' => 'key', 'key_id' => $id];
}

/*
 * Creates a key for $uid in team $t inside the caller's transaction. The caller has locked the player row (or just
 * inserted it): so two simultaneous creations of the same person count one after the other. At most
 * API_KEYS_PER_MEMBER keys per person and team (409 limit_reached). Returns the key as shown once:
 * ['id', 'name', 'key', 'hint', 'created'] (created: ISO 8601 UTC).
 */
function api_key_insert_locked(mysqli $link, string $uid, string $t, string $name): array
{
    $sql = $link->prepare("select count(1) from pok_api_keys_tbl where user_id = ? and team_id = ?");
    $sql->bind_param('ss', $uid, $t);
    $sql->execute();
    $count = (int)$sql->get_result()->fetch_row()[0];
    $sql->close();
    if ($count >= API_KEYS_PER_MEMBER) {
        throw new ApiError(409, 'limit_reached', null, 'At most ' . API_KEYS_PER_MEMBER . ' API keys per person and team.');
    }

    $key = new_api_key();
    $hash = api_key_hash($key);
    $hint = substr($key, -API_KEY_HINT_LENGTH);
    $sql = $link->prepare("insert into pok_api_keys_tbl (key_hash, key_hint, user_id, team_id, name) values (?, ?, ?, ?, ?)");
    $sql->bind_param('sssss', $hash, $hint, $uid, $t, $name);
    $sql->execute();
    $id = (int)$sql->insert_id;
    $sql->close();

    $sql = $link->prepare("select unix_timestamp(creation_date) from pok_api_keys_tbl where id = ?");
    $sql->bind_param('i', $id);
    $sql->execute();
    $created = $sql->get_result()->fetch_row()[0];
    $sql->close();

    return ['id' => $id, 'name' => $name, 'key' => $key, 'hint' => $hint, 'created' => iso_utc($created)];
}

/* api/delete_user.php: every key of $uid over ALL teams (they would not count anyway without the player row) */
function api_keys_delete_user(mysqli $link, string $uid): void
{
    $sql = $link->prepare("delete from pok_api_keys_tbl where user_id = ?");
    $sql->bind_param('s', $uid);
    $sql->execute();
    $sql->close();
}
