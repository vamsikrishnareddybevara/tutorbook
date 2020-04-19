# Functions

We use [Firebase Cloud Functions](https://firebase.google.com/docs/functions/)
to power most of our back-end work:

- REST API via [HTTP
  triggers](https://firebase.google.com/docs/functions/http-events) that handles
  important data validation and
  [Firestore](https://firebase.google.com/docs/firestore) management. More
  specifications are included below.
- Notifications via [Firestore
  triggers](https://firebase.google.com/docs/functions/firestore-events) (e.g.
  send out an email whenever a new `appt` document is created).

## Objects

Included below are the impromptu reference of the objects referred to in our
REST API specs (impromptu because they're already all defined as interfaces in
the [`@tutorbook/model`](https://github.com/tutorbookapp/covid-tutoring/tree/master/src/model/lib/)
package; the interfaces defined there are **ground truth** and will always be
up-to-date):

### `Attendee`

The `Attendee` object represents a user attending a tutoring appointment.

| Property | Type       | Description                                                                                             |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `roles`  | `string[]` | An array of the roles (i.e. `tutor` or `pupil`) that the attendee will play during the tutoring lesson. |
| `uid`    | `string`   | The user's Firebase Authentication uID (i.e. also the ID of their Firestore profile document).          |

### `Timeslot`

The `Timeslot` object represents a window of time (in which a tutoring
appointment will take place).

| Property | Type                  | Description        |
| -------- | --------------------- | ------------------ |
| `from`   | `Date` or `Timestamp` | The starting time. |
| `to`     | `Date` or `Timestamp` | The ending time.   |

## REST API

Included below are the specifications of our REST API endpoints (accessible from
`https://us-central1-covid-tutoring.cloudfunctions.net/{functionName}`).

### `newAppt`

The `newAppt` endpoint creates a new tutoring lesson between the desired
attendees.

#### Parameters

The following parameters should be sent in the HTTP request body.

| Parameter   | Type         | Description                                                               |
| ----------- | ------------ | ------------------------------------------------------------------------- |
| `attendees` | `Attendee[]` | An array of `Attendee` objects who will be attending the tutoring lesson. |
| `subjects`  | `string[]`   | An array of the subjects that the tutoring lesson will be about.          |
| `time`      | `Timeslot`   | The `Timeslot` object that denotes when the lesson will take place.       |

#### Actions

Upon request, the `newAppt` cloud function will:

1. Verify the correct request body was sent (e.g. all parameters are there and
   are all of the correct types).
2. Verify that the requested `Timeslot` is within all of the `attendee`'s
   availability (by reading each `attendee`'s Firestore profile document).
3. Verify that the requested `subjects` are included in each of the tutors'
   Firestore profile documents (where a tutor is defined as an `attendee` whose
   `roles` include `tutor`).
4. Update each `attendee`'s availability (in their Firestore profile document)
   to reflect this appointment (i.e. remove the appointment's `time` from their
   availability).
5. Create a new `appt` document containing the request body in each of the
   `attendee`'s Firestore `appts` subcollection.

## Firestore Triggers

### `newApptNotification`

The `newApptNotification` function should trigger every time a new `appt`
document is created and should send out emails to each of the `attendee`'s with:

- Link to video call
- Link to virtual whiteboard (probably using
  [DrawChat](https://github.com/cojapacze/sketchpad))
- Link to shared Google Drive folder

**TODO:** Perhaps we should just include this in the `newAppt` REST API function
instead of creating a new background function.