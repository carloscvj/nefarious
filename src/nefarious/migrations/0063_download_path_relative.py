# Generated by Django 3.0.2 on 2021-03-25 16:07

from django.conf import settings
from django.db import migrations
from django.db.models import Value
from django.db.models.functions import Replace


def update_download_paths(apps, schema_editor):
    """
    Replace absolute path in `download_path` to just the base path since
    containers are mounting the paths differently

    OLD:
        /downloads/completed/movies/12.Years.a.Slave.2013.avi
    NEW:
        movies/12.Years.a.Slave.2013.avi
    """

    WatchMovie = apps.get_model('nefarious', 'WatchMovie')
    WatchTVEpisode = apps.get_model('nefarious', 'WatchTVEpisode')
    WatchTVSeason = apps.get_model('nefarious', 'WatchTVSeason')

    internal_base_path = settings.INTERNAL_DOWNLOAD_PATH.rstrip('/') + '/'

    for model in [WatchMovie, WatchTVSeason, WatchTVEpisode]:
        model.objects.exclude(download_path__isnull=True).update(
            download_path=Replace('download_path', Value(internal_base_path)))


class Migration(migrations.Migration):

    dependencies = [
        ('nefarious', '0062_nefarioussettings_open_subtitles_auto'),
    ]

    operations = [
        migrations.RunPython(update_download_paths),
    ]
