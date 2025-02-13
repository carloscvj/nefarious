import { NgZone } from '@angular/core';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../api.service';
import { ToastrService } from 'ngx-toastr';
import * as _ from 'lodash';
import { Observable, Subscription } from 'rxjs';
import {catchError, concatMap, tap} from 'rxjs/operators';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';


@Component({
  selector: 'app-media-tv',
  templateUrl: './media-t-v.component.html',
  styleUrls: ['./media-t-v.component.css']
})
export class MediaTVComponent implements OnInit, OnDestroy {
  public result: any;
  public isManuallySearching = false;
  public isManualSearchEnabled = false;
  public autoWatchFutureSeasons = false;
  public watchEpisodesFormGroup: FormGroup;
  public manualSearchTmdbSeason: any;
  public manualSearchTmdbEpisode: any;
  public isLoading = true;
  public isSaving = false;
  public activeNav = 'details';

  protected _changes: Subscription;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private toastr: ToastrService,
    private ngZone: NgZone,
    private fb: FormBuilder,
  ) {
  }

  ngOnInit() {
    const routeParams = this.route.snapshot.params;
    this.apiService.searchMediaDetail(this.apiService.SEARCH_MEDIA_TYPE_TV, routeParams.id).subscribe(
      (data) => {
        // set result and build the watching options
        this.result = data;
        this._buildWatchEpisodesForm();

        // populate "auto watch" settings
        const watchShow = this._getWatchShow();
        if (watchShow) {
          this.autoWatchFutureSeasons = watchShow.auto_watch;
        }

        this.isLoading = false;
      },
      (error) => {
        this.toastr.error('An unknown error occurred');
      }
    );

    // watch for updated media
    this._changes = this.apiService.mediaUpdated$.subscribe(
      () => {
        this.ngZone.run(() => {
          this._buildWatchEpisodesForm();
        });
      }
    );
  }

  ngOnDestroy() {
    this._changes.unsubscribe();
  }

  public mediaPosterURL(result) {
    return `${this.apiService.settings.tmdb_configuration.images.secure_base_url}/original/${result.poster_path}`;
  }

  public watchAllSeasons() {

    if (!this.isWatchingShow()) {
      // enable auto-watch
      this.autoWatchFutureSeasons = true;
      this._watchShow(true).subscribe(
        (data) => {
          this.watchAllSeasons();
        }, (error) => {
          console.error(error);
          this.autoWatchFutureSeasons = false;
          this.toastr.error('An unknown error occurred');
        }
      );
    } else {
      // enable auto-watch
      this.autoWatchFutureSeasons = true;
      this.apiService.updateWatchTVShow(this._getWatchShow().id, {auto_watch: this.autoWatchFutureSeasons}).subscribe(
        () => {},
        (error) => {
          console.error(error);
          this.autoWatchFutureSeasons = false;
          this.toastr.error('An unknown error occurred');
        }
      );
      // watch every season we're not already watching
      for (const season of this.result.seasons) {
        if (!this.isWatchingSeason(season)) {
          this.watchEntireSeason(season);
        }
      }
    }
  }

  public watchEntireSeason(season) {

    this.isSaving = true;

    if (!this.isWatchingShow()) {
      this._watchShow().subscribe(
        (data) => {
          this.watchEntireSeason(season);
        }
      );
    } else {

      const watchTvShow = this._getWatchShow();

      this.apiService.watchTVSeasonRequest(watchTvShow.id, season.season_number, season.air_date).subscribe(
        () => {
          this.isSaving = false;
          this.toastr.success(`Watching season ${season.season_number}`);
          this._buildWatchEpisodesForm();
        },
        (error) => {
          this.isSaving = false;
          this.toastr.error('An unknown error occurred');
          console.error(error);
        }
      );
    }
  }

  public userIsStaff(): boolean {
    return this.apiService.userIsStaff();
  }

  public stopWatchingShow() {

    const watchShow = this._getWatchShow();

    if (watchShow) {
      this.isSaving = true;
      this.apiService.unWatchTVShow(watchShow.id).subscribe(
        (data) => {
          this.toastr.success('Stopped watching show');
          this._buildWatchEpisodesForm();
          this.autoWatchFutureSeasons = false;
          this.isSaving = false;
        },
        (error) => {
          this.toastr.error('An unknown error occurred');
          this.isSaving = false;
        }
      );
    }
  }

  public getWatchMedia() {
    return this._getWatchShow();
  }

  public isWatchingAllSeasons() {
    for (const season of this.result.seasons) {
      if (!this.isWatchingSeason(season)) {
        return false;
      }
    }
    return true;
  }

  public isWatchingSeason(season: any) {
    const watchSeasonRequest = this._getWatchSeasonRequest(season.season_number);
    return Boolean(watchSeasonRequest) || this.isWatchingAllEpisodesInSeason(season);
  }

  public hasCollectedAllEpisodesInSeason(season: any) {
    // watching entire season
    if (this.hasCollectedSeason(season)) {
      return true;
    }

    // verify every episode is collected
    for (const episode of season.episodes) {
      const watchEpisode = this._getWatchEpisode(episode.id);
      if (!watchEpisode || !watchEpisode.collected) {
        return false;
      }
    }
    return true;
  }

  public isWatchingAllEpisodesInSeason(season: any) {
    // watching all episodes in season
    let watchingEpisodes = 0;
    for (const episode of season.episodes) {
      if (this.isWatchingEpisode(episode.id)) {
        watchingEpisodes += 1;
      }
    }
    return season.episodes.length === watchingEpisodes;
  }

  public isWatchingAnyEpisodeInSeason(season: any) {
    for (const episode of season.episodes) {
      if (this.isWatchingEpisode(episode.id)) {
        return true;
      }
    }
    return false;
  }

  public hasCollectedSeason(season): boolean {
    const watchSeason = this._getWatchSeason(season.season_number);
    return watchSeason && watchSeason.collected;
  }

  public stopWatchingEntireSeason(season: any) {
    const watchSeasonRequest = this._getWatchSeasonRequest(season.season_number);
    if (watchSeasonRequest) {
      this.isSaving = true;
      this.apiService.unWatchTVSeason(watchSeasonRequest.id).subscribe(
        (data) => {
          this.toastr.success(`Stopped watching ${this.result.name} - Season ${watchSeasonRequest.season_number}`);
          this._buildWatchEpisodesForm();
          this.isSaving = false;
        },
        (error) => {
          console.error(error);
          this.toastr.error('An unknown error occurred');
          this.isSaving = false;
        }
      );
    }
  }

  public isWatchingShow() {
    return Boolean(this._getWatchShow());
  }

  public manuallySearchSeason(season: any) {
    this.manualSearchTmdbSeason = season;
    this.isManuallySearching = true;
    this.activeNav = 'manual';
  }

  public manuallySearchEpisode(season: any, episode: any) {
    this.manualSearchTmdbSeason = season;
    this.manualSearchTmdbEpisode = episode;
    this.isManuallySearching = true;
    this.activeNav = 'manual';
  }

  public manuallyDownloadComplete() {
    this.isManuallySearching = false;
    this.activeNav = 'details';
    this._buildWatchEpisodesForm();
  }

  public canUnWatchSeason(seasonNumber: number) {
    const watchSeasonRequest = this._getWatchSeasonRequest(seasonNumber);
    return this.userIsStaff() || (watchSeasonRequest && watchSeasonRequest.requested_by === this.apiService.user.username);
  }

  public canUnWatchShow() {
    const watchShow = this._getWatchShow();
    return this.userIsStaff() || (watchShow && watchShow.requested_by === this.apiService.user.username);
  }

  public canUnWatchEpisode(episodeId) {
    const watchEpisode = this._getWatchEpisode(episodeId);
    return this.userIsStaff() || (watchEpisode && watchEpisode.requested_by === this.apiService.user.username);
  }

  public isWatchingEpisode(episodeId): Boolean {
    return Boolean(_.find(this.apiService.watchTVEpisodes, (watching) => {
      return watching.tmdb_episode_id === episodeId;
    }));
  }

  public autoWatchUpdate() {
    const watchTvShow = this._getWatchShow();
    if (watchTvShow) {
      this.apiService.updateWatchTVShow(watchTvShow.id, {auto_watch: this.autoWatchFutureSeasons}).subscribe(
        (data) => {
          this.toastr.success('Updated auto watch');
        }, (error) => {
          console.error(error);
          this.toastr.error('An unknown error occurred updating auto watch');
        }
      );
    }
  }

  protected _watchShow(autoWatchNewSeasons?: boolean): Observable<any> {
    return this.apiService.watchTVShow(this.result.id, this.result.name, this.mediaPosterURL(this.result), this.result.first_air_date, autoWatchNewSeasons).pipe(
      tap((data) => {
        this.toastr.success(`Watching show ${data.name}`);
      }),
      catchError((error) => {
        this.toastr.error('An unknown error occurred');
        throw error;
      }),
    );
  }

  protected _getWatchSeasonRequest(seasonNumber: number) {
    const watchShow = this._getWatchShow();
    if (watchShow) {
      return _.find(this.apiService.watchTVSeasonRequests, (watchSeasonRequest) => {
        return watchSeasonRequest.watch_tv_show === watchShow.id && watchSeasonRequest.season_number === seasonNumber;
      });
    }
    return null;
  }

  protected _getWatchSeason(seasonNumber: number) {
    const watchShow = this._getWatchShow();
    if (watchShow) {
      return _.find(this.apiService.watchTVSeasons, (watchSeason) => {
        return watchSeason.watch_tv_show === watchShow.id && watchSeason.season_number === seasonNumber;
      });
    }
    return null;
  }

  protected _buildWatchEpisodesForm() {
    // build episode form
    const watchingControls: any = {};
    for (const season of this.result.seasons) {
      for (const episode of season.episodes) {

        // episode form control
        const control = new FormControl({
          value: this.isWatchingEpisode(episode.id) || this.isWatchingSeason(season),
          disabled: this.isWatchingSeason(season) || (
            this.isWatchingEpisode(episode.id) && !this.canUnWatchEpisode(episode.id)),
        });

        // handle change events for individual episodes
        control.valueChanges.subscribe((shouldWatch: boolean) => {
          // disable/enable input while it's saving
          control.disable({emitEvent: false});
          this._updateWatchEpisode(episode.id, shouldWatch).subscribe(() => {
            control.enable({emitEvent: false});
          });
        });

        watchingControls[episode.id] = control;
      }
    }

    // update episode form
    if (this.watchEpisodesFormGroup) {
      Object.keys(this.watchEpisodesFormGroup.controls).forEach((name) => {
        const existingControl = <FormControl>this.watchEpisodesFormGroup.controls[name];
        const newControl = watchingControls[name];
        existingControl.setValue(newControl.value, {emitEvent: false});
        if (newControl.enabled) {
          existingControl.enable({emitEvent: false});
        } else {
          existingControl.disable({emitEvent: false});
        }
      });
    } else {
      // create episode form
      this.watchEpisodesFormGroup = this.fb.group(watchingControls);
    }
  }

  protected _getWatchEpisode(episodeId) {
    return _.find(this.apiService.watchTVEpisodes, (watch) => {
      return watch.tmdb_episode_id === episodeId;
    });
  }

  protected _getEpisode(episodeId) {
    let result = null;
    _.each(this.result.seasons, (season) => {
      _.each(season.episodes, (episode) => {
        if (episode.id === episodeId) {
          result = episode;
          return;
        }
      });
    });
    return result;
  }

  protected _getWatchShow() {
    return _.find(this.apiService.watchTVShows, (watchShow) => {
      return watchShow.tmdb_show_id === this.result.id;
    });
  }

  protected _updateWatchEpisode(episodeId: number, shouldWatch: boolean): Observable<any> {
    const episode = this._getEpisode(episodeId);
    let observable: Observable<any>;

    if (shouldWatch) {
      const watchShow = this._getWatchShow();
      if (!watchShow) {
        // start watching show first and then watch requested episode
        observable = this._watchShow(false).pipe(
          concatMap((show) => {
            return this.apiService.watchTVEpisode(
              show.id, Number(episodeId), episode.season_number, episode.episode_number, episode.air_date);
          }),
        );
      } else {
       observable = this.apiService.watchTVEpisode(
          watchShow.id, Number(episodeId), episode.season_number, episode.episode_number, episode.air_date);
      }
    } else {
      const watchEpisode = this._getWatchEpisode(episodeId);
      observable = this.apiService.unWatchTVEpisode(watchEpisode.id);
    }

    return observable.pipe(
      tap(() => {
          this.isSaving = false;
          this.toastr.success(
            shouldWatch ? `Started watching episode ${episode.episode_number}` : `Stopped watching episode ${episode.episode_number}`);
        },
        (error) => {
          this.isSaving = false;
          this.toastr.error('An unknown error occurred');
          console.error(error);
        },
      )
    );
  }
}
