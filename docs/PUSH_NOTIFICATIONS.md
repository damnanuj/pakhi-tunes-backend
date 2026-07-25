# Push Notification System

End-to-end push notifications for Pakhi Tunes (device-centric, guest-friendly).

## Architecture

- **Devices** are first-class (not users). Guests and logged-in users both receive pushes.
- **Backend** resolves audience → FCM tokens → batched multicast send → logs + invalid token cleanup.
- **Admin** composes / schedules / reviews delivery at `/admin/notifications`.
- **Mobile** registers FCM token on launch, routes taps through a central notification router.

## Backend APIs

### Devices (optionalAuth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/devices/register` | Upsert device by `installationId` + FCM token |
| POST | `/devices/unlink` | Clear `userId` on logout (keep device active) |
| DELETE | `/devices/:installationId` | Soft-deactivate device |
| GET | `/devices` | Admin list |

Register body:

```json
{
  "installationId": "<persistent-device-uuid>",
  "fcmToken": "<fcm-token>",
  "platform": "android",
  "appVersion": "1.1.0",
  "deviceModel": "Pixel",
  "clearUser": false
}
```

### Notifications (admin only)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/notifications` | Create (+ optional `sendNow` / `scheduledAt`) |
| GET | `/notifications` | History (paginated) |
| GET | `/notifications/stats` | Aggregate stats |
| GET | `/notifications/:id` | Detail + delivery logs |
| POST | `/notifications/:id/send` | Send draft/scheduled |
| POST | `/notifications/:id/cancel` | Cancel |
| DELETE | `/notifications/:id` | Delete draft/cancelled |

## Action types (deep links)

| actionType | Payload | Mobile behavior |
|------------|---------|-----------------|
| `open_app` | — | Open home |
| `navigate` | `screen` | Home / explore / library / profile / … |
| `play_song` | `songId` | Open player + fetch & play |
| `open_album` | `albumId` | Album screen |
| `open_playlist` | `playlistId` | Playlist screen |
| `open_artist` | `artistId` | Artist screen |
| `open_url` | `url` | External URL |

## Audience types

`all` · `logged_in` · `guests` · `single_user` · `multiple_users` · `segment` (filters)

## Ops notes

- Uses existing Firebase Admin credentials (`FIREBASE_*`).
- Scheduled sends: cron every minute (non-Vercel / long-running server).
- Rate limit: 10 create/send requests per admin per minute.
- Invalid FCM tokens are marked `inactive` automatically.
- Mobile rebuild required after `app.json` permission changes (POST_NOTIFICATIONS).
