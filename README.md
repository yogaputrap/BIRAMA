# BIRAMA

BIRAMA (Bank Indonesia Institute Room Allocation and Management Application) 
is a web-based classroom booking and monitoring system developed for Bank 
Indonesia Institute.

BIRAMA is designed to help organizations manage room reservations in a more 
organized, transparent, and efficient way. It provides a centralized 
platform to facilitate room allocation, streamline the booking process, 
monitor room availability, and reservation activities.

## Overview

The system provides a centralized platform for users to submit classroom
booking requests and for administrators to manage reservations and
monitor room usage.

## Key Features

-   **Room Information** --- View available classrooms and their
    details.
-   **Booking Management** --- Submit and manage classroom reservation
    requests.
-   **Availability Monitoring** --- Check room availability to help
    prevent scheduling conflicts.
-   **Booking Status Tracking** --- Follow the status of submitted
    booking requests.
-   **Administrative Management** --- Manage booking requests and
    room-related information through an administrative interface.
-   **Email Notifications** --- Receive email communications related to
    booking activities.

## Technology Stack

BIRAMA is developed using web technologies, including:

-   **Backend:** ASP.NET Core Web API
-   **Framework:** .NET
-   **Database:** Microsoft SQL Server
-   **Data Access:** Entity Framework Core
-   **Frontend:** HTML, CSS, and JavaScript
-   **Deployment:** Microsoft Azure

## Project Structure

The repository contains the application source code and supporting
project resources. The backend application also serves the frontend
assets.

``` text
BIRAMA/
├── backend/
│   ├── Controllers/
│   ├── Data/
│   ├── DTOs/
│   ├── Models/
│   ├── Services/
│   ├── wwwroot/
│   ├── Program.cs
│   └── BIRAMA.API.csproj
├── .gitignore
└── README.md
```

*The actual folder structure may vary depending on the current
source-code version.*

## Getting Started

### Prerequisites

Before running the application locally, make sure the following tools
are installed:

-   .NET SDK compatible with the project
-   Microsoft SQL Server
-   A code editor or IDE, such as Visual Studio or Visual Studio Code
-   Git

### Setup

1.  Clone the repository:

    ``` bash
    git clone https://github.com/<your-username>/<your-repository>.git
    cd <your-repository>
    ```

2.  Configure the database connection string and other required
    application settings using your local development configuration or
    environment variables.

3.  Restore dependencies:

    ``` bash
    dotnet restore
    ```

4.  Build the application:

    ``` bash
    dotnet build
    ```

5.  Run the application:

    ``` bash
    dotnet run
    ```

6.  Open the local URL shown in the terminal.

> Setup details may depend on the configuration of your development
> environment. Do not commit passwords, API keys, connection strings,
> OAuth secrets, or other credentials to the repository.

## Configuration and Security

BIRAMA requires environment-specific configuration for services such as
the database, authentication, and email delivery.

-   Keep credentials and secrets outside source control.
-   Use environment variables or a secure secrets manager for sensitive
    settings.
-   Configure OAuth redirect URLs for the environment where the
    application is running.
-   Use HTTPS in production.
-   Do not include production database backups, personal data, or access
    tokens in the repository.

## Deployment

The application can be deployed to a hosting environment that supports
ASP.NET Core. The production deployment may require:

-   A configured SQL Server database
-   Application environment variables
-   Authentication provider configuration
-   Email service configuration
-   HTTPS and appropriate network access rules
