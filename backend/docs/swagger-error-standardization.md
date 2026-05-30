# Swagger Error Standardization

Every endpoint should document the same error surface, even when the route-specific payload differs.

## Required Response Codes
- `200` Success
- `201` Created
- `400` Validation Error
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `409` Conflict
- `422` Business Validation Error
- `500` Internal Server Error

## Standard Response Shapes

### Success
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

### Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized access"
}
```

### Forbidden
```json
{
  "success": false,
  "message": "Permission denied"
}
```

### Conflict
```json
{
  "success": false,
  "message": "Resource already exists"
}
```

### Internal Server Error
```json
{
  "success": false,
  "message": "Something went wrong. Please try again later."
}
```

## Documentation Rule
For every endpoint in Swagger, include examples for:
- `200`
- `201`
- `400`
- `401`
- `403`
- `404`
- `409`
- `422`
- `500`

## Notes
- Do not expose stack traces or raw MongoDB/driver messages in Swagger examples.
- Prefer human-readable messages over technical exception text.
- Keep success payloads aligned with the runtime response formatter used by the backend.
