#!/usr/bin/env python3
"""Prepare one consistent Money Penny backup for a host-based Kopia client."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
from datetime import datetime, timezone


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, **kwargs)


def container(project, service):
    ids = docker("ps", "--filter", f"label=com.docker.compose.project={project}",
                 "--filter", f"label=com.docker.compose.service={service}",
                 "--format", "{{.ID}}", capture_output=True, text=True).stdout.split()
    if len(ids) != 1:
        raise RuntimeError(f"Expected one running {service} container for project {project}; found {len(ids)}. Do not back up during deployment.")
    return json.loads(docker("inspect", ids[0], capture_output=True, text=True).stdout)[0]


def prepare(project, destination, config_dir=None):
    destination = Path(destination).absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise RuntimeError("Backup destination must be a directory, not a symlink or file.")
    if destination.exists() and any(destination.iterdir()):
        marker = destination / "manifest.json"
        if not marker.is_file() or json.loads(marker.read_text()).get("compose_project") != project:
            raise RuntimeError("Destination contains data that is not a backup of this project.")
    if config_dir and (destination == Path(config_dir).resolve() or Path(config_dir).resolve() in destination.parents):
        raise RuntimeError("Store backups outside the Coolify configuration directory.")
    # Prevent concurrent preparation jobs; Kopia should call this as its before action.
    lock_path = destination.parent / ("." + destination.name + ".lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        containers = {name: container(project, name) for name in ["web", "worker", "db"]}
        stage = Path(tempfile.mkdtemp(prefix=".money-penny-stage-", dir=destination.parent))
        restart = []
        try:
            # Stop web first to prevent new writes, then the worker. PostgreSQL stays up.
            for name in ["web", "worker"]:
                cid = containers[name]["Id"]
                restart.append(cid)  # Restart even if docker stop is interrupted after succeeding.
                docker("stop", "--time", "60", cid, stdout=subprocess.DEVNULL)
            dump = stage / "ledger.dump"
            with dump.open("wb") as output:
                docker("exec", containers["db"]["Id"], "pg_dump", "-U", "ledger", "-d", "ledger", "-Fc", stdout=output)
            if dump.stat().st_size == 0:
                raise RuntimeError("Database dump is empty.")
            with dump.open("rb") as source:
                docker("exec", "-i", containers["db"]["Id"], "pg_restore", "--list", stdin=source, stdout=subprocess.DEVNULL)
            files = stage / "files"
            files.mkdir()
            docker("cp", containers["web"]["Id"] + ":/data/.", str(files))
            if config_dir:
                config = stage / "configuration"
                config.mkdir()
                found = False
                for name in [".env", "docker-compose.yml", "docker-compose.yaml", "compose.yaml"]:
                    source = Path(config_dir) / name
                    if source.is_file():
                        shutil.copy2(source, config / name)
                        found = True
                if not found:
                    raise RuntimeError("No .env or Compose file found in --config-dir.")
            manifest = {
                "format_version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "compose_project": project,
                "database": "ledger",
                "database_image": containers["db"]["Config"]["Image"],
                "database_image_id": containers["db"]["Image"],
                "web_image_id": containers["web"]["Image"],
                "files": "files (contents of /data)",
                "configuration_included": bool(config_dir),
            }
            (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        except BaseException:
            shutil.rmtree(stage, ignore_errors=True)
            raise
        finally:
            errors = []
            for cid in restart:
                try:
                    docker("start", cid, stdout=subprocess.DEVNULL)
                except Exception as error:
                    errors.append(error)
            if errors:
                shutil.rmtree(stage, ignore_errors=True)
                raise RuntimeError("Could not restart an app container. Check Docker and restart web/worker manually.") from errors[0]
        # Publish only after capture, validation, and restart have succeeded.
        previous = destination.parent / ("." + destination.name + ".previous")
        if previous.exists():
            raise RuntimeError(f"Previous backup recovery directory exists: {previous}. Resolve it before retrying.")
        if destination.exists():
            destination.rename(previous)
        try:
            stage.rename(destination)
        except Exception:
            if previous.exists():
                previous.rename(destination)
            raise
        if previous.exists():
            shutil.rmtree(previous)
        print(f"Prepared database and statement backup at {destination}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Exact com.docker.compose.project label from Coolify")
    parser.add_argument("--destination", default="/srv/money-penny/backup")
    parser.add_argument("--config-dir", help="Optional Coolify deployment folder; copies .env and Compose files")
    args = parser.parse_args()
    def interrupted(signum, frame):
        raise SystemExit("Backup preparation interrupted.")
    signal.signal(signal.SIGTERM, interrupted)
    os.umask(0o077)
    prepare(args.project, args.destination, args.config_dir)


if __name__ == "__main__":
    main()
