import React from "react";
import { InjectedRouter } from "react-router";
import PATHS from "router/paths";

import configAPI from "services/entities/config";
import teamsAPI, { ILoadTeamResponse } from "services/entities/teams";
import { IConfig } from "interfaces/config";

import SectionHeader from "components/SectionHeader/SectionHeader";
import EndUserExperiencePreview from "pages/ManageControlsPage/components/EndUserExperiencePreview";
import { useQuery } from "react-query";
import { ITeamConfig } from "interfaces/team";
import Spinner from "components/Spinner";
import RequireEndUserAuth from "./components/RequireEndUserAuth/RequireEndUserAuth";
import EndUserAuthForm from "./components/EndUserAuthForm/EndUserAuthForm";

const baseClass = "end-user-authentication";

const getEnabledEndUserAuth = (
  currentTeamId: number,
  globalConfig?: IConfig,
  teamConfig?: ITeamConfig
) => {
  if (globalConfig === undefined && teamConfig === undefined) {
    return false;
  }

  // team is "No team" when currentTeamId === 0
  if (currentTeamId === 0) {
    return (
      globalConfig?.mdm?.macos_setup.enable_end_user_authentication ?? false
    );
  }

  return teamConfig?.mdm?.macos_setup.enable_end_user_authentication ?? false;
};

interface IEndUserAuthenticationProps {
  currentTeamId: number;
  router: InjectedRouter;
}

const EndUserAuthentication = ({
  currentTeamId,
  router,
}: IEndUserAuthenticationProps) => {
  const { data: globalConfig, isLoading: isLoadingGlobalConfig } = useQuery<
    IConfig,
    Error
  >(["config"], () => configAPI.loadAll(), {
    refetchOnWindowFocus: false,
    retry: false,
    enabled: currentTeamId === 0,
  });

  const { data: teamConfig, isLoading: isLoadingTeamConfig } = useQuery<
    ILoadTeamResponse,
    Error,
    ITeamConfig
  >(["team", currentTeamId], () => teamsAPI.load(currentTeamId), {
    refetchOnWindowFocus: false,
    retry: false,
    enabled: currentTeamId !== 0,
    select: (res) => res.team,
  });

  const defaultIsEndUserAuthEnabled = getEnabledEndUserAuth(
    currentTeamId,
    globalConfig,
    teamConfig
  );

  const onClickConnect = () => {
    router.push(PATHS.ADMIN_INTEGRATIONS_AUTOMATIC_ENROLLMENT);
  };

  return (
    <div className={baseClass}>
      <SectionHeader title="End user authentication" />
      {isLoadingGlobalConfig || isLoadingTeamConfig ? (
        <Spinner />
      ) : (
        <div className={`${baseClass}__content`}>
          {true ? (
            <RequireEndUserAuth onClickConnect={onClickConnect} />
          ) : (
            <EndUserAuthForm
              currentTeamId={currentTeamId}
              defaultIsEndUserAuthEnabled={defaultIsEndUserAuthEnabled}
            />
          )}
          {/* TODO: get gif */}
          <EndUserExperiencePreview previewImage="">
            <p>
              When the end user reaches the <b>Remote Management</b> pane in the
              macOS Setup Assistant, they are asked to authenticate and agree to
              the end user license agreement (EULA).
            </p>
            <p>
              After, Fleet enrolls the Mac, applies macOS settings, and installs
              the bootstrap package.
            </p>
          </EndUserExperiencePreview>
        </div>
      )}
    </div>
  );
};

export default EndUserAuthentication;
