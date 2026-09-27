from fastapi.testclient import TestClient


def test_health_uses_application_configuration(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "MethodMark Test API",
        "version": "0.1.0",
        "environment": "test",
    }


def test_openapi_documents_the_versioned_health_contract(client: TestClient) -> None:
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    operation = schema["paths"]["/api/v1/health"]["get"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }
    assert client.get("/api/docs").status_code == 200


def test_cors_allows_the_configured_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_does_not_allow_an_unconfigured_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://unconfigured.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_unimplemented_generation_route_returns_not_found(client: TestClient) -> None:
    response = client.post("/api/v1/questions/generate", json={"topic": "algebra"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
